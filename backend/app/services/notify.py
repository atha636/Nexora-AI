"""In-app notifications. Creating one never commits: the caller's transaction does, so a notification
exists if and only if the thing it announces was saved."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK
from app.db.models import ApprovalRequest, Document, Notification, OrganizationMember, WorkflowExecution, utcnow

KEEP_PER_USER = 200  # older ones are removed so the table can't grow without bound


def notify(
    db: Session,
    organization_id: uuid.UUID,
    user_ids: list[uuid.UUID],
    *,
    kind: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    exclude: uuid.UUID | None = None,
) -> int:
    """Notifies each distinct person once. `exclude` is the person who caused the event (no need to tell them)."""
    n = 0
    for uid in dict.fromkeys(user_ids):
        if uid is None or uid == exclude:
            continue
        db.add(
            Notification(
                organization_id=organization_id, user_id=uid, kind=kind, title=title[:200],
                body=body[:300] if body else None, link=link, entity_type=entity_type, entity_id=entity_id,
            )
        )
        n += 1
    return n


def members_with_role(db: Session, organization_id: uuid.UUID, minimum: str) -> list[uuid.UUID]:
    rows = db.execute(
        select(OrganizationMember.profile_id, OrganizationMember.role).where(OrganizationMember.organization_id == organization_id)
    ).all()
    return [pid for pid, role in rows if ROLE_RANK.get(role, 0) >= ROLE_RANK[minimum]]


# ---------------------------------------------------------------- events
def approval_requested(db: Session, a: ApprovalRequest) -> None:
    """Everyone who can decide it (managers and above), except the person who asked."""
    notify(
        db, a.organization_id, members_with_role(db, a.organization_id, "manager"),
        kind="approval.requested", title="Approval needed", body=a.title, link="/approvals",
        entity_type="approval", entity_id=a.id, exclude=a.requested_by,
    )


def approval_decided(db: Session, a: ApprovalRequest) -> None:
    """Tells the requester how it ended. Runs started by a workflow are announced by the workflow instead."""
    if a.requested_by is None or a.requested_via == "workflow":
        return
    to = (a.payload or {}).get("lead_name", "the lead")
    text = {
        "executed": ("approval.approved", "Your email was approved", f"Email to {to} was sent."),
        "failed": ("approval.failed", "Approved, but sending failed", a.error_message or "Sending failed."),
        "rejected": ("approval.rejected", "Your request was rejected", a.decision_note or a.title),
    }.get(a.status)
    if text:
        kind, title, body = text
        notify(db, a.organization_id, [a.requested_by], kind=kind, title=title, body=body, link="/approvals",
               entity_type="approval", entity_id=a.id, exclude=a.decided_by)


def workflow_finished(db: Session, ex: WorkflowExecution, *, actor: uuid.UUID | None = None) -> None:
    if ex.created_by is None or ex.status not in ("completed", "failed"):
        return
    ok = ex.status == "completed"
    who = f" for {ex.lead_name}" if ex.lead_name else ""
    notify(
        db, ex.organization_id, [ex.created_by], kind="workflow.completed" if ok else "workflow.failed",
        title=f"Workflow {'finished' if ok else 'failed'}: {ex.workflow_name}",
        body=(f"Run{who} completed." if ok else (ex.error_message or "A step failed. You can retry it.")),
        link="/workflows", entity_type="workflow_execution", entity_id=ex.id, exclude=actor if ok else None,
    )


def document_finished(db: Session, doc: Document) -> None:
    if doc.uploaded_by is None or doc.status not in ("ready", "failed"):
        return
    ok = doc.status == "ready"
    notify(
        db, doc.organization_id, [doc.uploaded_by], kind="document.ready" if ok else "document.failed",
        title=f"{doc.filename} is ready" if ok else f"{doc.filename} could not be processed",
        body=f"Indexed into {doc.chunk_count} searchable passages." if ok else doc.error_message,
        link="/knowledge", entity_type="document", entity_id=doc.id,
    )


# ---------------------------------------------------------------- reading
def unread_count(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.organization_id == organization_id, Notification.user_id == user_id, Notification.read_at.is_(None)
        )
    ) or 0


def mark_read(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID, notification_id: uuid.UUID | None = None) -> int:
    q = update(Notification).where(
        Notification.organization_id == organization_id, Notification.user_id == user_id, Notification.read_at.is_(None)
    )
    if notification_id:
        q = q.where(Notification.id == notification_id)
    return db.execute(q.values(read_at=utcnow())).rowcount or 0


def prune(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID) -> None:
    ids = db.scalars(
        select(Notification.id).where(Notification.organization_id == organization_id, Notification.user_id == user_id)
        .order_by(Notification.created_at.desc()).offset(KEEP_PER_USER)
    ).all()
    if ids:
        db.query(Notification).filter(Notification.id.in_(ids)).delete(synchronize_session=False)