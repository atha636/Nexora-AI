import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    file_type: str
    file_size: int
    status: str  # pending | processing | ready | failed
    error_message: str | None
    page_count: int | None
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class SearchRequest(BaseModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    top_k: int = Field(5, ge=1, le=10)
    document_id: uuid.UUID | None = None  # limit the search to one document


class SearchHitOut(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    page_number: int | None
    chunk_index: int
    content: str
    score: float


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHitOut]


class AskRequest(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    top_k: int = Field(5, ge=1, le=10)
    document_id: uuid.UUID | None = None


class CitationOut(BaseModel):
    number: int  # matches the [n] markers in the answer text
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    page_number: int | None
    chunk_index: int
    snippet: str
    score: float


class AskResponse(BaseModel):
    answer: str
    found: bool  # False = the documents did not contain enough information
    reason: str | None  # no_sources | insufficient | ungrounded
    citations: list[CitationOut]
    sources_considered: int
    model: str | None
    latency_ms: int
    prompt_tokens: int | None
    completion_tokens: int | None