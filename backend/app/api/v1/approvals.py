import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, AuthContext, get_auth_context
from app.db.models import ApprovalRequest, Profile
from app.db.session import get_db
from app.schemas.email import ApprovalList, ApprovalOut, DecisionNote
from app.services import approvals as svc

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _name(db: Session, user_id: uuid.UUID | None) -> str | None:
    return db.scalar(select(Profile.full_name).where(Profile.id == user_id)) if user_id else None


def approval_out(db: Session, ctx: AuthContext, a: ApprovalRequest) -> ApprovalOut:
    return ApprovalOut(
        id=a.id, action_type=a.action_type, entity_type=a.entity_type, entity_id=a.entity_id, title=a.title,
        payload=a.payload, status=a.status, requested_by_name=_name(db, a.requested_by), requested_via=a.requested_via,
        decided_by_name=_name(db, a.decided_by), decided_at=a.decided_at, decision_note=a.decision_note,
        executed_at=a.executed_at, result=a.result, error_message=a.error_message, created_at=a.created_at,
        can_decide=svc.can_decide(ctx, a), can_cancel=svc.can_cancel(ctx, a),
    )


def _wrap(fn, *args):
    try:
        return fn(*args)
    except svc.ApprovalError as e:
        raise HTTPException(e.status_code, e.message) from None


@router.get("", response_model=ApprovalList)
def list_approvals(
    scope: Literal["pending", "history", "all"] = "pending",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ApprovalList:
    base = select(ApprovalRequest).where(ApprovalRequest.organization_id == ctx.organization_id)
    if ROLE_RANK[ctx.role] < ROLE_RANK["manager"]:
        base = base.where(ApprovalRequest.requested_by == ctx.user.id)  # employees: their own requests only
    pending = db.scalar(select(func.count()).select_from(base.where(ApprovalRequest.status == "pending").subquery())) or 0
    q = base
    if scope == "pending":
        q = q.where(ApprovalRequest.status == "pending")
    elif scope == "history":
        q = q.where(ApprovalRequest.status != "pending")
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(ApprovalRequest.created_at.desc(), ApprovalRequest.id).offset((page - 1) * page_size).limit(page_size))
    return ApprovalList(items=[approval_out(db, ctx, a) for a in rows], total=total, pending=pending)


@router.get("/{approval_id}", response_model=ApprovalOut)
def read(approval_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> ApprovalOut:
    return approval_out(db, ctx, _wrap(svc.get_approval, db, ctx, approval_id))


@router.post("/{approval_id}/approve", response_model=ApprovalOut)
def approve(
    approval_id: uuid.UUID, body: DecisionNote | None = None, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> ApprovalOut:
    """Approving runs the action immediately, exactly once. Permission and self-approval rules
    are enforced in the service, not in the UI."""
    return approval_out(db, ctx, _wrap(svc.approve, db, ctx, approval_id, body.note if body else None))


@router.post("/{approval_id}/reject", response_model=ApprovalOut)
def reject(
    approval_id: uuid.UUID, body: DecisionNote | None = None, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> ApprovalOut:
    return approval_out(db, ctx, _wrap(svc.reject, db, ctx, approval_id, body.note if body else None))


@router.post("/{approval_id}/cancel", response_model=ApprovalOut)
def cancel(approval_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> ApprovalOut:
    return approval_out(db, ctx, _wrap(svc.cancel, db, ctx, approval_id))