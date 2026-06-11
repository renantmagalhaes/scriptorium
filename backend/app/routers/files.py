import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..auth import get_current_user, get_current_user_query
from ..config import settings

router = APIRouter(prefix="/api/files", tags=["files"])

# Resolved once at startup so every request path-checks against a stable root.
_CORPUS = Path(settings.corpus_root).resolve()
_CORPUS_PREFIX = str(_CORPUS) + os.sep


def _safe_path(rel: str) -> Path:
    """
    Resolve a relative path against the corpus root and assert containment.
    Raises 403 on any path that escapes the root (symlinks, '../', url-encoded
    traversal sequences, etc.).

    _CORPUS_PREFIX ends with os.sep, so:
      • /corpus/file.pdf  → starts with /corpus/ ✓
      • /corpus           → does not start with /corpus/ → 403 (blocks dir)
      • /etc/passwd       → does not start with /corpus/ → 403
      • /corpus2/file     → does not start with /corpus/ → 403
    """
    target = (_CORPUS / rel).resolve()
    if not str(target).startswith(_CORPUS_PREFIX):
        raise HTTPException(status_code=403, detail="Access denied")
    return target


@router.get("/view/{file_path:path}")
async def view_file(
    file_path: str,
    _: Annotated[str, Depends(get_current_user_query)],
) -> FileResponse:
    """Serve a file inline for browser rendering (PDF, images, text).
    Auth via ?token= query param so <iframe>/<img> src URLs work without
    custom headers. No Content-Disposition → browser renders inline."""
    target = _safe_path(file_path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=str(target))


@router.get("/{file_path:path}")
async def serve_file(
    file_path: str,
    _: Annotated[str, Depends(get_current_user)],
) -> FileResponse:
    """Download a file with Content-Disposition: attachment.
    Auth via Authorization: Bearer header (axios handles this automatically)."""
    target = _safe_path(file_path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=str(target), filename=target.name)
