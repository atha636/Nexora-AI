"""Semantic search over one organization's document chunks (cosine similarity).

Postgres: pgvector does the ranking inside the database (`<=>` cosine distance).
SQLite (local dev/tests): embeddings are stored as JSON, so the ranking is done with numpy.
Both paths apply the same tenant filter and only search documents that are fully indexed.
"""

import uuid
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentChunk


@dataclass
class SearchHit:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    page_number: int | None
    chunk_index: int
    content: str
    score: float  # cosine similarity: 1.0 = identical direction, 0 = unrelated


_COLUMNS = (
    DocumentChunk.id,
    DocumentChunk.document_id,
    Document.filename,
    DocumentChunk.page_number,
    DocumentChunk.chunk_index,
    DocumentChunk.content,
)


def _base_filters(organization_id: uuid.UUID, document_id: uuid.UUID | None):
    # The organization is checked on BOTH tables: a chunk can only be returned if the chunk
    # and its parent document both belong to the caller's organization.
    filters = [
        DocumentChunk.organization_id == organization_id,
        Document.organization_id == organization_id,
        Document.status == "ready",
    ]
    if document_id is not None:
        filters.append(DocumentChunk.document_id == document_id)
    return filters


def search_chunks(
    db: Session,
    organization_id: uuid.UUID,
    query_vector: list[float],
    top_k: int = 5,
    document_id: uuid.UUID | None = None,
) -> list[SearchHit]:
    filters = _base_filters(organization_id, document_id)
    join = Document.id == DocumentChunk.document_id

    if db.get_bind().dialect.name == "postgresql":
        distance = DocumentChunk.embedding.cosine_distance(query_vector)
        rows = db.execute(
            select(*_COLUMNS, distance.label("distance"))
            .join(Document, join)
            .where(*filters)
            .order_by(distance, DocumentChunk.id)
            .limit(top_k)
        ).all()
        return [_hit(r[:6], 1.0 - float(r.distance)) for r in rows]

    rows = db.execute(select(*_COLUMNS, DocumentChunk.embedding).join(Document, join).where(*filters)).all()
    if not rows:
        return []
    matrix = np.array([r.embedding for r in rows], dtype=np.float32)
    query = np.array(query_vector, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1) * (np.linalg.norm(query) or 1.0)
    scores = (matrix @ query) / np.where(norms == 0, 1.0, norms)
    order = sorted(range(len(rows)), key=lambda i: (-float(scores[i]), str(rows[i].id)))[:top_k]
    return [_hit(rows[i][:6], float(scores[i])) for i in order]


def _hit(row, score: float) -> SearchHit:
    return SearchHit(
        chunk_id=row[0],
        document_id=row[1],
        filename=row[2],
        page_number=row[3],
        chunk_index=row[4],
        content=row[5],
        score=round(score, 4),
    )