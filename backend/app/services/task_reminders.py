"""Reminders for tasks that have come due.

There is no background scheduler (free hosting sleeps), so reminders are created the next time the person's
app asks for their task summary. Each task is reminded once per due date (`reminded_at`), and the notification
is created in the same transaction that records that, so it can't be sent twice or lost.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Lead, Task, utcnow
from app.services.notify import notify


def aware(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; Postgres gives aware ones. Treat naive ones as UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def send_due_reminders(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID) -> int:
    now = utcnow()
    due = db.scalars(
        select(Task).where(
            Task.organization_id == organization_id,
            Task.assigned_to == user_id,
            Task.status == "open",
            Task.due_at.is_not(None),
            Task.due_at <= now,
            Task.reminded_at.is_(None),
        ).limit(25)
    ).all()
    for t in due:
        lead = db.get(Lead, t.lead_id) if t.lead_id else None
        notify(
            db, organization_id, [user_id], kind="task.due", title=f"Task due: {t.title}",
            body=f"Follow up with {lead.name}" if lead else None,
            link=f"/leads/{t.lead_id}" if t.lead_id else "/tasks", entity_type="task", entity_id=t.id,
        )
        t.reminded_at = now
    return len(due)