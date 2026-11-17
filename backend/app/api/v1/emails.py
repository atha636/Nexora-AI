import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agent.service import _org_name
from app.api.deps import ROLE_RANK, AuthContext, get_auth_context, log_activity
from app.db.models import EmailDraft, Lead
from app.db.session import get_db
from app.schemas.email import ApprovalOut, DraftCreate, DraftList, DraftOut, DraftUpdate, EmailMeta
from app.services.approvals import ApprovalError, request_email_approval
from app.services.email_drafts import PURPOSES, TONES, create_draft
from app.services.email_provider import get_email_provider
from app.services.llm import LLMClient, LLMError, get_llm

router = APIRouter(prefix="/emails", tags=["emails"])


def _is_manager(ctx: AuthContext) -> bool:
    return ROLE_RANK[ctx.role] >= ROLE_RANK["manager"]


def get_draft(db: Session, ctx: AuthContext, draft_id: uuid.UUID) -> EmailDraft:
    d = db.scalar(select(EmailDraft).where(EmailDraft.id == draft_id, EmailDraft.organization_id == ctx.organization_id))
    # Employees see only their own drafts; others look like they don't exist.
    if d is None or (not _is_manager(ctx) and d.created_by != ctx.user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft not found")
    return d


def _out(db: Session, d: EmailDraft) -> DraftOut:
    out = DraftOut.model_validate(d)
    if d.lead_id:
        out.lead_name = db.scalar(select(Lead.name).where(Lead.id == d.lead_id, Lead.organization_id == d.organization_id))
    return out


@router.get("/meta", response_model=EmailMeta)
def meta(_: AuthContext = Depends(get_auth_context)) -> EmailMeta:
    p = get_email_provider()
    return EmailMeta(tones=list(TONES), purposes=list(PURPOSES), provider=p.name, simulated=p.simulated)


@router.post("/drafts", response_model=DraftOut, status_code=status.HTTP_201_CREATED)
def create(
    body: DraftCreate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
) -> DraftOut:
    """Writes a draft with the AI. Nothing is sent."""
    lead = db.scalar(select(Lead).where(Lead.id == body.lead_id, Lead.organization_id == ctx.organization_id))
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    try:
        draft = create_draft(
            db, ctx, llm, lead, org_name=_org_name(db, ctx), tone=body.tone, purpose=body.purpose, instructions=body.instructions
        )
    except LLMError as e:
        db.rollback()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None
    db.commit()
    db.refresh(draft)
    return _out(db, draft)


@router.get("/drafts", response_model=DraftList)
def list_drafts(
    status_filter: str | None = Query(None, alias="status"),
    lead_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftList:
    q = select(EmailDraft).where(EmailDraft.organization_id == ctx.organization_id, EmailDraft.status != "discarded")
    if not _is_manager(ctx):
        q = q.where(EmailDraft.created_by == ctx.user.id)
    if status_filter:
        q = q.where(EmailDraft.status == status_filter)
    if lead_id:
        q = q.where(EmailDraft.lead_id == lead_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(EmailDraft.created_at.desc(), EmailDraft.id).offset((page - 1) * page_size).limit(page_size))
    return DraftList(items=[_out(db, d) for d in rows], total=total)


@router.get("/drafts/{draft_id}", response_model=DraftOut)
def read(draft_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> DraftOut:
    return _out(db, get_draft(db, ctx, draft_id))


def _editable(d: EmailDraft) -> None:
    if d.status not in ("draft", "failed"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This draft can't be changed (it is {d.status.replace('_', ' ')}).")


@router.patch("/drafts/{draft_id}", response_model=DraftOut)
def update(
    draft_id: uuid.UUID, body: DraftUpdate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> DraftOut:
    d = get_draft(db, ctx, draft_id)
    _editable(d)  # a draft waiting for approval is frozen, so what is approved is what is sent
    if body.subject is not None:
        d.subject = body.subject
    if body.body is not None:
        d.body = body.body
    log_activity(db, ctx, entity_type="email_draft", entity_id=d.id, action="email.edited")
    db.commit()
    db.refresh(d)
    return _out(db, d)


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard(draft_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> Response:
    d = get_draft(db, ctx, draft_id)
    _editable(d)
    d.status = "discarded"
    log_activity(db, ctx, entity_type="email_draft", entity_id=d.id, action="email.discarded")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/drafts/{draft_id}/request-approval", response_model=ApprovalOut, status_code=status.HTTP_201_CREATED)
def ask_approval(draft_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> ApprovalOut:
    from app.api.v1.approvals import approval_out  # local import: both routers share the serializer

    d = get_draft(db, ctx, draft_id)
    try:
        a = request_email_approval(db, ctx, d)
    except ApprovalError as e:
        db.rollback()
        raise HTTPException(e.status_code, e.message) from None
    db.commit()
    db.refresh(a)
    return approval_out(db, ctx, a)