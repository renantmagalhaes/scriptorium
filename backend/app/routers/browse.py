from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/api/browse", tags=["browse"])


@router.get("")
async def browse(
    _: Annotated[str, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (await db.execute(
        text("SELECT id, path, status FROM documents ORDER BY path")
    )).mappings()
    return {"items": [dict(r) for r in rows]}
