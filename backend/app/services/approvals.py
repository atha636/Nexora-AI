"""The human-in-the-loop gate.

A sensitive action (today: sending an email) is never run directly. Someone asks for it
(`request_email_approval`), which stores a frozen snapshot, and a person with enough rights decides.
Only `approve` can cause the action to run, and it does so exactly once: the decision is claimed with
a conditional UPDATE (status must still be "pending"), so two clicks or two requests can't both win.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, AuthContext, log_activity
from app.db.models import ApprovalRequest, EmailDraft, Lead, utcnow
from app.services.email_provider import EmailSendError, get_email_provider


def _notify_workflows(db: Session, a: ApprovalRequest) -> None:
    """Lets a workflow run that was waiting for this request finish (imported lazily: workflows uses this module)."""
    from app.services.workflows import on_approval_finished

    on_approval_finished(db, a)


class ApprovalError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code, self.message = status_code, message


def can_decide(ctx: AuthContext, a: ApprovalRequest) -> bool:
    """Managers and above may decide. Nobody below admin may approve their own request."""
    if a.status != "pending" or ROLE_RANK[ctx.role] < ROLE_RANK["manager"]:
        return False
    return a.requested_by != ctx.user.id or ROLE_RANK[ctx.role] >= ROLE_RANK["admin"]


def can_cancel(ctx: AuthContext, a: ApprovalRequest) -> bool:
    return a.status == "pending" and (a.requested_by == ctx.user.id or ROLE_RANK[ctx.role] >= ROLE_RANK["admin"])


def get_approval(db: Session, ctx: AuthContext, approval_id: uuid.UUID) -> ApprovalRequest:
    a = db.scalar(
        select(ApprovalRequest).where(ApprovalRequest.id == approval_id, ApprovalRequest.organization_id == ctx.organization_id)
    )
    # Employees only see their own requests; anything else looks like it doesn't exist.
    if a is None or (ROLE_RANK[ctx.role] < ROLE_RANK["manager"] and a.requested_by != ctx.user.id):
        raise ApprovalError(404, "Approval request not found")
    return a


# ---------------------------------------------------------------- requesting
def request_email_approval(db: Session, ctx: AuthContext, draft: EmailDraft, *, via: str = "user") -> ApprovalRequest:
    if draft.status not in ("draft", "failed"):
        raise ApprovalError(409, f"This draft can't be sent for approval (it is {draft.status.replace('_', ' ')}).")
    lead = db.scalar(select(Lead).where(Lead.id == draft.lead_id, Lead.organization_id == ctx.organization_id)) if draft.lead_id else None
    if lead is None:
        raise ApprovalError(409, "The lead for this draft no longer exists.")
    if not lead.email:
        raise ApprovalError(422, "This lead has no email address. Add one on the lead first.")
    approval = ApprovalRequest(
        id=uuid.uuid4(),
        organization_id=ctx.organization_id,
        action_type="send_email",
        entity_type="email_draft",
        entity_id=draft.id,
        title=f"Send email to {lead.name}: {draft.subject}"[:200],
        payload={
            "draft_id": str(draft.id),
            "lead_id": str(lead.id),
            "lead_name": lead.name,
            "to": lead.email,
            "subject": draft.subject,
            "body": draft.body,
        },
        requested_by=ctx.user.id,
        requested_via=via,
    )
    db.add(approval)
    draft.status = "pending_approval"
    draft.approval_id = approval.id
    db.flush()
    log_activity(db, ctx, entity_type="approval", entity_id=approval.id, action="approval.requested",
                 details={"action": "send_email", "via": via})
    return approval


# ---------------------------------------------------------------- deciding
def _claim(db: Session, ctx: AuthContext, approval_id: uuid.UUID, new_status: str, note: str | None) -> ApprovalRequest:
    """Atomically moves a pending request to its new status. Exactly one caller can succeed."""
    res = db.execute(
        update(ApprovalRequest)
        .where(
            ApprovalRequest.id == approval_id,
            ApprovalRequest.organization_id == ctx.organization_id,
            ApprovalRequest.status == "pending",
        )
        .values(status=new_status, decided_by=ctx.user.id, decided_at=utcnow(), decision_note=note)
    )
    if res.rowcount != 1:
        db.rollback()
        raise ApprovalError(409, "This request was already decided or cancelled.")
    db.expire_all()
    return db.get(ApprovalRequest, approval_id)


def _draft_of(db: Session, a: ApprovalRequest) -> EmailDraft | None:
    return db.scalar(select(EmailDraft).where(EmailDraft.id == a.entity_id, EmailDraft.organization_id == a.organization_id))


def approve(db: Session, ctx: AuthContext, approval_id: uuid.UUID, note: str | None = None) -> ApprovalRequest:
    a = get_approval(db, ctx, approval_id)
    if not can_decide(ctx, a):
        if a.status != "pending":
            raise ApprovalError(409, "This request was already decided or cancelled.")
        if ROLE_RANK[ctx.role] < ROLE_RANK["manager"]:
            raise ApprovalError(403, "You don't have permission to do that")
        raise ApprovalError(403, "You can't approve your own request. Ask another manager or an admin.")
    a = _claim(db, ctx, approval_id, "approved", note)
    log_activity(db, ctx, entity_type="approval", entity_id=a.id, action="approval.approved")
    db.commit()
    return _execute(db, ctx, a)


def reject(db: Session, ctx: AuthContext, approval_id: uuid.UUID, note: str | None = None) -> ApprovalRequest:
    a = get_approval(db, ctx, approval_id)
    if not can_decide(ctx, a):
        if a.status != "pending":
            raise ApprovalError(409, "This request was already decided or cancelled.")
        if ROLE_RANK[ctx.role] < ROLE_RANK["manager"]:
            raise ApprovalError(403, "You don't have permission to do that")
        raise ApprovalError(403, "You can't decide your own request. Ask another manager or an admin.")
    a = _claim(db, ctx, approval_id, "rejected", note)
    draft = _draft_of(db, a)
    if draft and draft.status == "pending_approval":
        draft.status = "draft"  # the author can revise and ask again
    log_activity(db, ctx, entity_type="approval", entity_id=a.id, action="approval.rejected")
    _notify_workflows(db, a)
    db.commit()
    db.refresh(a)
    return a


def cancel(db: Session, ctx: AuthContext, approval_id: uuid.UUID) -> ApprovalRequest:
    a = get_approval(db, ctx, approval_id)
    if not can_cancel(ctx, a):
        if a.status != "pending":
            raise ApprovalError(409, "This request was already decided or cancelled.")
        raise ApprovalError(403, "Only the requester or an admin can cancel a request.")
    res = db.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == a.id, ApprovalRequest.status == "pending")
        .values(status="cancelled", decided_by=ctx.user.id, decided_at=utcnow())
    )
    if res.rowcount != 1:
        db.rollback()
        raise ApprovalError(409, "This request was already decided or cancelled.")
    db.expire_all()
    a = db.get(ApprovalRequest, approval_id)
    draft = _draft_of(db, a)
    if draft and draft.status == "pending_approval":
        draft.status = "draft"
    log_activity(db, ctx, entity_type="approval", entity_id=a.id, action="approval.cancelled")
    _notify_workflows(db, a)
    db.commit()
    db.refresh(a)
    return a


# ---------------------------------------------------------------- executing (only reached from approve)
def _execute(db: Session, ctx: AuthContext, a: ApprovalRequest) -> ApprovalRequest:
    if a.action_type != "send_email":  # future action types are added here, one explicit branch each
        a.status, a.error_message = "failed", "Unknown action type."
        db.commit()
        return a
    p = a.payload  # the frozen snapshot, NOT the current draft text
    draft = _draft_of(db, a)
    lead = db.scalar(select(Lead).where(Lead.id == uuid.UUID(p["lead_id"]), Lead.organization_id == a.organization_id))
    now = utcnow()
    try:
        receipt = get_email_provider().send(to=p["to"], subject=p["subject"], body=p["body"], from_name=ctx.user.full_name)
    except EmailSendError as e:
        a.status, a.error_message = "failed", str(e)
        if draft:
            draft.status = "failed"
        log_activity(db, ctx, entity_type="approval", entity_id=a.id, action="approval.failed")
        _notify_workflows(db, a)
        db.commit()
        db.refresh(a)
        return a
    a.status, a.executed_at = "executed", now
    a.result = {"provider": receipt.provider, "message_id": receipt.message_id, "simulated": receipt.simulated}
    if draft:
        draft.status, draft.sent_at = "sent", now
    if lead:
        lead.last_contacted_at = now
        if lead.status == "new":
            lead.status = "contacted"
    log_activity(
        db, ctx, entity_type="approval", entity_id=a.id, action="email.sent",
        details={"provider": receipt.provider, "simulated": receipt.simulated, "lead_id": p["lead_id"]},
    )
    _notify_workflows(db, a)
    db.commit()
    db.refresh(a)
    return a