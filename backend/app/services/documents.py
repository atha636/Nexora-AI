"""Document processing: file bytes -> text -> chunks -> embeddings -> stored chunks.

`process_document` runs as a background task after the upload response has been sent, with
its own database session. The document's `status` tells the UI where it is:
pending -> processing -> ready | failed.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, undefer

from app.core.config import get_settings
from app.db.models import ActivityLog, Document, DocumentChunk
from app.services.chunking import chunk_pages
from app.services.embeddings import Embedder
from app.services.extraction import ExtractionError, extract_pages

log = logging.getLogger(__name__)

# A free-tier server can restart mid-job and leave a document stuck in "processing".
# After this long we assume that happened and allow re-indexing.
STUCK_AFTER = timedelta(minutes=10)


def is_busy(doc: Document) -> bool:
    if doc.status not in ("pending", "processing"):
        return False
    updated = doc.updated_at
    if updated.tzinfo is None:  # SQLite returns naive datetimes
        updated = updated.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - updated < STUCK_AFTER


def _log(db: Session, doc: Document, action: str, details: dict) -> None:
    db.add(
        ActivityLog(
            organization_id=doc.organization_id,
            actor_id=doc.uploaded_by,
            entity_type="document",
            entity_id=doc.id,
            action=action,
            details={"name": doc.filename, **details},
        )
    )


def process_document(session_factory, embedder: Embedder, document_id: uuid.UUID) -> None:
    settings = get_settings()
    with session_factory() as db:
        doc = db.scalar(select(Document).options(undefer(Document.content)).where(Document.id == document_id))
        if doc is None:
            return  # deleted before processing started
        doc.status = "processing"
        doc.error_message = None
        db.commit()

        try:
            pages = extract_pages(doc.file_type, doc.content)
            chunks = chunk_pages(pages, settings.chunk_tokens, settings.chunk_overlap_tokens)
            if not chunks:
                raise ExtractionError("No readable text was found in this file.")
            if len(chunks) > settings.max_chunks_per_document:
                raise ExtractionError("This document is too long to index.")

            vectors = embedder.embed([c.text for c in chunks])

            db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
            db.add_all(
                DocumentChunk(
                    organization_id=doc.organization_id,
                    document_id=doc.id,
                    chunk_index=c.index,
                    page_number=c.page_number,
                    content=c.text,
                    token_count=c.token_count,
                    embedding=v,
                )
                for c, v in zip(chunks, vectors, strict=True)
            )
            doc.status = "ready"
            doc.chunk_count = len(chunks)
            doc.page_count = sum(1 for p in pages if p.number is not None) or None
            doc.error_message = None
            _log(db, doc, "document.indexed", {"chunks": len(chunks)})
            db.commit()
        except ExtractionError as e:
            db.rollback()
            _mark_failed(db, document_id, str(e))
        except Exception:
            db.rollback()
            log.exception("Document processing failed (document_id=%s)", document_id)
            _mark_failed(db, document_id, "Processing failed unexpectedly. Try re-indexing the document.")


def _mark_failed(db: Session, document_id: uuid.UUID, message: str) -> None:
    doc = db.get(Document, document_id)
    if doc is None:
        return
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    doc.status = "failed"
    doc.error_message = message[:500]
    doc.chunk_count = 0
    _log(db, doc, "document.failed", {})
    db.commit()