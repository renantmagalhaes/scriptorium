from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..auth import get_current_user
from ..database import get_db
from ..schemas import StatusResponse, StatusCount, ErrorEntry

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("", response_model=StatusResponse)
async def get_status(
    _: Annotated[str, Depends(get_current_user)],
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> StatusResponse:
    counts_sql = text("""
        SELECT status, COUNT(*) AS count
        FROM   documents
        GROUP  BY status
        ORDER  BY status
    """)
    offset = max(0, (page - 1) * limit)
    errors_sql = text("""
        SELECT id, path, error_detail, updated_at
        FROM   documents
        WHERE  status = 'error'
        ORDER  BY updated_at DESC
        LIMIT  :limit
        OFFSET :offset
    """)
    total_errors_sql = text("""
        SELECT COUNT(*) AS total
        FROM   documents
        WHERE  status = 'error'
    """)
    totals_sql = text("""
        SELECT
            (SELECT COUNT(*) FROM documents)   AS total_documents,
            (SELECT COUNT(*) FROM extractions) AS total_extractions
    """)

    counts_rows = (await db.execute(counts_sql)).mappings().all()
    error_rows  = (await db.execute(errors_sql, {"limit": limit, "offset": offset})).mappings().all()
    total_errors = (await db.execute(total_errors_sql)).scalar() or 0
    totals      = (await db.execute(totals_sql)).mappings().one()

    return StatusResponse(
        counts=[StatusCount(status=r["status"], count=r["count"]) for r in counts_rows],
        recent_errors=[
            ErrorEntry(
                id=r["id"],
                path=r["path"],
                error_detail=r["error_detail"],
                updated_at=r["updated_at"],
            )
            for r in error_rows
        ],
        total_documents=totals["total_documents"],
        total_extractions=totals["total_extractions"],
        total_errors=total_errors,
        page=page,
        limit=limit,
    )
