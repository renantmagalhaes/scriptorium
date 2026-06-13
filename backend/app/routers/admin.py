import asyncio
import json
from pathlib import Path

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..schemas import AdminSettings, OrphanDoc, OrphansResponse, PurgeRequest, PurgeResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])

try:
    from ocr.engine import ALL_EXTENSIONS as SUPPORTED_EXTENSIONS
except ImportError:
    SUPPORTED_EXTENSIONS = frozenset({
        ".pdf",
        ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".gif", ".webp",
        ".txt", ".md", ".rst", ".log", ".csv", ".tsv", ".nfo",
        ".xlsx", ".xls", ".ods",
        ".docx"
    })

_CORPUS = Path(settings.corpus_root)


def _find_missing(paths: list[str]) -> list[str]:
    """Return paths that no longer exist on disk or have unsupported extensions. Runs in a thread."""
    res = []
    for p in paths:
        path_obj = Path(p)
        if path_obj.suffix.lower() not in SUPPORTED_EXTENSIONS:
            res.append(p)
        elif not (_CORPUS / p).exists():
            res.append(p)
    return res


@router.post("/scan")
async def trigger_scan(_: str = Depends(get_current_user)):
    async with aioredis.from_url(settings.redis_url, decode_responses=True) as r:
        await r.lpush("scan_trigger", "1")
    return {"triggered": True}


@router.get("/settings", response_model=AdminSettings)
async def get_settings(_: str = Depends(get_current_user)):
    return AdminSettings(preserve_catalog=settings.preserve_catalog)


@router.get("/orphans", response_model=OrphansResponse)
async def get_orphans(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    rows = await db.execute(text("""
        SELECT d.id, d.path, d.status, d.ocr_completed_at,
               COUNT(e.id) AS extraction_count
        FROM documents d
        LEFT JOIN extractions e ON e.document_id = d.id
        GROUP BY d.id
        ORDER BY d.path
    """))
    docs = rows.fetchall()

    all_paths = [r.path for r in docs]
    missing = await asyncio.to_thread(_find_missing, all_paths)
    missing_set = set(missing)

    orphans = [
        OrphanDoc(
            id=r.id,
            path=r.path,
            status=r.status,
            ocr_completed_at=r.ocr_completed_at,
            extraction_count=r.extraction_count,
        )
        for r in docs
        if r.path in missing_set
    ]

    return OrphansResponse(orphans=orphans, total=len(orphans))


@router.post("/purge", response_model=PurgeResponse)
async def purge_orphans(
    body: PurgeRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    if not body.ids:
        return PurgeResponse(deleted=0)

    # Verify every requested ID is actually missing from disk before deleting —
    # guards against a stale client sending IDs that have since been re-indexed.
    rows = await db.execute(
        text("SELECT id, path FROM documents WHERE id = ANY(:ids)"),
        {"ids": body.ids},
    )
    docs = rows.fetchall()

    paths = [r.path for r in docs]
    still_missing = await asyncio.to_thread(_find_missing, paths)
    still_missing_set = set(still_missing)

    safe_ids = [r.id for r in docs if r.path in still_missing_set]

    if not safe_ids:
        return PurgeResponse(deleted=0)

    await db.execute(
        text("DELETE FROM documents WHERE id = ANY(:ids)"),
        {"ids": safe_ids},
    )
    await db.commit()

    return PurgeResponse(deleted=len(safe_ids))


@router.post("/retry-failed")
async def retry_failed_jobs(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    # Fetch all document IDs and paths that are in error state
    rows = await db.execute(
        text("SELECT id, path FROM documents WHERE status = 'error'")
    )
    docs = rows.fetchall()

    if not docs:
        return {"retried": 0}

    # Update status to pending and clear error details in DB
    await db.execute(
        text("""
            UPDATE documents
            SET status = 'pending',
                error_detail = NULL,
                updated_at = NOW()
            WHERE status = 'error'
        """)
    )
    await db.commit()

    # Enqueue jobs in Redis
    async with aioredis.from_url(settings.redis_url, decode_responses=True) as r:
        for doc in docs:
            await r.lpush(
                "ocr_queue",
                json.dumps({"document_id": doc.id, "path": doc.path})
            )

    return {"retried": len(docs)}
