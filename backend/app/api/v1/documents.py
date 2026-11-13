import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.core.config import get_settings
from app.db.models import Document, DocumentChunk
from app.db.session import get_db, get_session_factory
from app.schemas.document import (
    AskRequest,
    AskResponse,
    CitationOut,
    DocumentOut,
    SearchHitOut,
    SearchRequest,
    SearchResponse,
)
from app.services.documents import is_busy, process_document
from app.services.embeddings import Embedder, get_embedder
from app.services.llm import LLMClient, LLMError, LLMNotConfigured, get_llm
from app.services.rag import answer_question
from app.services.extraction import ExtractionError, FileTooLarge, safe_filename, validate_upload
from app.services.search import search_chunks

router = APIRouter(prefix="/documents", tags=["documents"])


def _get_document(db: Session, ctx: AuthContext, document_id: uuid.UUID) -> Document:
    # Scoped by organization: another tenant's document looks exactly like a missing one.
    doc = db.scalar(
        select(Document).where(Document.id == document_id, Document.organization_id == ctx.organization_id)
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
    session_factory=Depends(get_session_factory),
) -> Document:
    """Validates and stores the file, then indexes it in the background (202 = accepted).
    Poll GET /documents to watch `status` go pending -> processing -> ready | failed."""
    settings = get_settings()
    filename = safe_filename(file.filename)
    data = file.file.read(settings.max_upload_bytes + 1)  # never read more than the limit
    try:
        kind = validate_upload(filename, data)
    except FileTooLarge as e:
        raise HTTPException(413, str(e)) from None
    except ExtractionError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None

    count = db.scalar(
        select(func.count()).select_from(Document).where(Document.organization_id == ctx.organization_id)
    )
    if (count or 0) >= settings.max_documents_per_org:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Document limit reached ({settings.max_documents_per_org}). Delete a document first.",
        )

    doc = Document(
        organization_id=ctx.organization_id,
        uploaded_by=ctx.user.id,
        filename=filename,
        file_type=kind,
        file_size=len(data),
        status="pending",
        content=data,
    )
    db.add(doc)
    db.flush()
    log_activity(db, ctx, entity_type="document", entity_id=doc.id, action="document.uploaded", details={"name": filename})
    db.commit()
    db.refresh(doc)
    background_tasks.add_task(process_document, session_factory, embedder, doc.id)
    return doc


@router.get("", response_model=list[DocumentOut])
def list_documents(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.organization_id == ctx.organization_id)
            .order_by(Document.created_at.desc(), Document.id)
        )
    )


@router.post("/search", response_model=SearchResponse)
def search_documents(
    body: SearchRequest,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
) -> SearchResponse:
    """Semantic search over this organization's indexed documents. Phase 5 builds the
    cited-answer (RAG) feature on top of this same function."""
    if body.document_id is not None:
        _get_document(db, ctx, body.document_id)  # 404 if it isn't theirs
    vector = embedder.embed([body.query])[0]
    hits = search_chunks(db, ctx.organization_id, vector, body.top_k, body.document_id)
    return SearchResponse(
        query=body.query,
        hits=[SearchHitOut.model_validate(h, from_attributes=True) for h in hits],
    )


@router.post("/ask", response_model=AskResponse)
def ask_documents(
    body: AskRequest,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
    llm: LLMClient = Depends(get_llm),
) -> AskResponse:
    """Answers a question using only this organization's indexed documents, with citations.
    `found=false` means the documents don't contain enough information (the model never guesses)."""
    if body.document_id is not None:
        _get_document(db, ctx, body.document_id)
    try:
        result = answer_question(
            db, ctx.organization_id, body.question, embedder, llm, top_k=body.top_k, document_id=body.document_id
        )
    except LLMNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None
    except LLMError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None
    return AskResponse(
        answer=result.answer,
        found=result.found,
        reason=result.reason,
        citations=[CitationOut.model_validate(c, from_attributes=True) for c in result.citations],
        sources_considered=result.sources_considered,
        model=result.model,
        latency_ms=result.latency_ms,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
    )


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> Document:
    return _get_document(db, ctx, document_id)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
) -> Response:
    doc = _get_document(db, ctx, document_id)
    log_activity(db, ctx, entity_type="document", entity_id=doc.id, action="document.deleted", details={"name": doc.filename})
    # Delete chunks explicitly so it also works on SQLite, which doesn't enforce cascades.
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
    db.delete(doc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{document_id}/reindex", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
def reindex_document(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
    embedder: Embedder = Depends(get_embedder),
    session_factory=Depends(get_session_factory),
) -> Document:
    doc = _get_document(db, ctx, document_id)
    if is_busy(doc):
        raise HTTPException(status.HTTP_409_CONFLICT, "This document is still being processed.")
    doc.status = "pending"
    doc.error_message = None
    log_activity(db, ctx, entity_type="document", entity_id=doc.id, action="document.reindexed", details={"name": doc.filename})
    db.commit()
    db.refresh(doc)
    background_tasks.add_task(process_document, session_factory, embedder, doc.id)
    return doc