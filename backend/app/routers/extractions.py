from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..auth import get_current_user
from ..database import get_db
from ..schemas import ExtractionListResponse, ExtractionPage, ExtractionUpdateRequest

router = APIRouter(prefix="/api/extractions", tags=["extractions"])


@router.get("/{doc_id}", response_model=ExtractionListResponse)
async def get_extractions(
    doc_id: int,
    _: Annotated[str, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> ExtractionListResponse:
    doc = (await db.execute(
        text("SELECT id, path FROM documents WHERE id = :doc_id"),
        {"doc_id": doc_id},
    )).mappings().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    rows = (await db.execute(
        text("""
            SELECT id, page, text, original_text
            FROM   extractions
            WHERE  document_id = :doc_id
            ORDER  BY page NULLS FIRST, id
        """),
        {"doc_id": doc_id},
    )).mappings().all()

    return ExtractionListResponse(
        doc_id=doc["id"],
        path=doc["path"],
        pages=[
            ExtractionPage(
                id=row["id"],
                page=row["page"],
                text=row["text"],
                original_text=row["original_text"],
            )
            for row in rows
        ],
    )


@router.patch("/{extraction_id}", response_model=ExtractionPage)
async def update_extraction(
    extraction_id: int,
    body: ExtractionUpdateRequest,
    _: Annotated[str, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> ExtractionPage:
    # First edit: preserve original in original_text.
    # Subsequent edits: keep the original.
    # Revert (new text == original): clear original_text.
    row = (await db.execute(
        text("""
            UPDATE extractions
            SET text          = :new_text,
                original_text = CASE
                    WHEN original_text IS NULL AND text <> :new_text
                        THEN text                  -- first edit: archive current text
                    WHEN :new_text = original_text
                        THEN NULL                  -- reverted to original: clear flag
                    ELSE original_text             -- subsequent edit: keep original
                END
            WHERE id = :id
            RETURNING id, page, text, original_text
        """),
        {"id": extraction_id, "new_text": body.text},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Extraction not found")

    await db.commit()
    return ExtractionPage(**dict(row))
