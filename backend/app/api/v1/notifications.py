"""A person's own notifications. Everything is scoped to the signed-in user inside their organization."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.models import Notification
from app.db.session import get_db
from app.schemas.notification import NotificationList, NotificationOut
from app.services import notify as svc

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=50),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> NotificationList:
    svc.prune(db, ctx.organization_id, ctx.user.id)  # keeps only the newest few hundred per person
    db.commit()
    q = select(Notification).where(Notification.organization_id == ctx.organization_id, Notification.user_id == ctx.user.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    rows = db.scalars(q.order_by(Notification.created_at.desc()).limit(limit)).all()
    return NotificationList(items=[NotificationOut.model_validate(r) for r in rows], unread=svc.unread_count(db, ctx.organization_id, ctx.user.id))


@router.post("/read-all", status_code=status.HTTP_200_OK)
def read_all(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> dict:
    n = svc.mark_read(db, ctx.organization_id, ctx.user.id)
    db.commit()
    return {"marked": n}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def read_one(notification_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> NotificationOut:
    n = db.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.organization_id == ctx.organization_id, Notification.user_id == ctx.user.id
        )
    )
    if n is None:  # someone else's notification looks like it doesn't exist
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    svc.mark_read(db, ctx.organization_id, ctx.user.id, n.id)
    db.commit()
    db.refresh(n)
    return NotificationOut.model_validate(n)