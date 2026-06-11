from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SearchResult(BaseModel):
    doc_id: int
    path: str
    status: str
    ocr_completed_at: Optional[datetime]
    updated_at: datetime
    snippet: str   # safe HTML: only <mark> tags; all other chars entity-escaped
    rank: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    query: str
    page: int
    limit: int


class ExtractionPage(BaseModel):
    id: int
    page: Optional[int]
    text: str
    original_text: Optional[str]


class ExtractionListResponse(BaseModel):
    doc_id: int
    path: str
    pages: list[ExtractionPage]


class ExtractionUpdateRequest(BaseModel):
    text: str


class AdminSettings(BaseModel):
    preserve_catalog: bool


class OrphanDoc(BaseModel):
    id: int
    path: str
    status: str
    ocr_completed_at: Optional[datetime]
    extraction_count: int


class OrphansResponse(BaseModel):
    orphans: list[OrphanDoc]
    total: int


class PurgeRequest(BaseModel):
    ids: list[int]


class PurgeResponse(BaseModel):
    deleted: int


class StatusCount(BaseModel):
    status: str
    count: int


class ErrorEntry(BaseModel):
    id: int
    path: str
    error_detail: Optional[str]
    updated_at: datetime


class StatusResponse(BaseModel):
    counts: list[StatusCount]
    recent_errors: list[ErrorEntry]
    total_documents: int
    total_extractions: int
