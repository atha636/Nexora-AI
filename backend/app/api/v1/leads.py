import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.db.models import ActivityLog, Lead, OrganizationMember, Profile
from app.db.session import get_db
from app.schemas.lead import (
    ActivityOut,
    BulkDelete,
    BulkUpdate,
    LeadCreate,
    LeadList,
    LeadOut,
    LeadPriority,
    LeadStatus,
    LeadUpdate,
)

router = APIRouter(prefix="/leads", tags=["leads"])

_PRIORITY_RANK = case({"high": 3, "medium": 2, "low": 1}, value=Lead.priority, else_=0)
SORT_COLUMNS = {
    "name": Lead.name,
    "city": Lead.city,
    "status": Lead.status,
    "priority": _PRIORITY_RANK,
    "created_at": Lead.created_at,
    "last_contacted_at": Lead.last_contacted_at,
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _get_lead(db: Session, ctx: AuthContext, lead_id: uuid.UUID) -> Lead:
    # Scoped by organization: another tenant's lead looks exactly like a missing one.
    lead = db.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.organization_id == ctx.organization_id)
    )
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return lead


def _check_assignee(db: Session, ctx: AuthContext, assignee_id: uuid.UUID | None) -> None:
    """The assignee must be a member of the caller's own organization."""
    if assignee_id is None:
        return
    is_member = db.scalar(
        select(OrganizationMember.id).where(
            OrganizationMember.profile_id == assignee_id,
            OrganizationMember.organization_id == ctx.organization_id,
        )
    )
    if is_member is None:
        raise HTTPException(422, "Assignee is not in your organization")


def _jsonable(value):
    return value if value is None or isinstance(value, (str, int, float, bool)) else str(value)


@router.get("", response_model=LeadList)
def list_leads(
    q: str | None = Query(None, max_length=100),
    city: str | None = Query(None, max_length=80),
    priority: LeadPriority | None = None,
    status_: LeadStatus | None = Query(None, alias="status"),
    sort: Literal["name", "city", "status", "priority", "created_at", "last_contacted_at"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> LeadList:
    conditions = [Lead.organization_id == ctx.organization_id]
    if q:
        like = f"%{_escape_like(q.strip())}%"
        conditions.append(
            or_(
                Lead.name.ilike(like, escape="\\"),
                Lead.email.ilike(like, escape="\\"),
                Lead.company.ilike(like, escape="\\"),
                Lead.phone.ilike(like, escape="\\"),
            )
        )
    if city:
        conditions.append(func.lower(Lead.city) == city.strip().lower())
    if priority:
        conditions.append(Lead.priority == priority)
    if status_:
        conditions.append(Lead.status == status_)

    total = db.scalar(select(func.count()).select_from(Lead).where(*conditions)) or 0

    sort_col = SORT_COLUMNS[sort]
    ordering = sort_col.asc() if order == "asc" else sort_col.desc()
    rows = db.scalars(
        select(Lead)
        .where(*conditions)
        .order_by(ordering, Lead.id)  # id as a tiebreaker keeps pages stable
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return LeadList(items=rows, total=total, page=page, page_size=page_size)


@router.get("/cities", response_model=list[str])
def list_cities(
    ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> list[str]:
    """Distinct cities in this organization, for the filter dropdown."""
    return list(
        db.scalars(
            select(Lead.city)
            .where(Lead.organization_id == ctx.organization_id, Lead.city.is_not(None))
            .distinct()
            .order_by(Lead.city)
        )
    )


@router.post("", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
def create_lead(
    body: LeadCreate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Lead:
    _check_assignee(db, ctx, body.assigned_to)
    lead = Lead(**body.model_dump(), organization_id=ctx.organization_id)
    db.add(lead)
    db.flush()
    log_activity(
        db,
        ctx,
        entity_type="lead",
        entity_id=lead.id,
        action="lead.created",
        details={"name": lead.name},
    )
    db.commit()
    db.refresh(lead)
    return lead


@router.post("/bulk-delete")
def bulk_delete(
    body: BulkDelete,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
) -> dict:
    ids = db.scalars(
        select(Lead.id).where(Lead.id.in_(body.ids), Lead.organization_id == ctx.organization_id)
    ).all()
    if ids:
        db.execute(delete(Lead).where(Lead.id.in_(ids)))
        log_activity(db, ctx, entity_type="lead", action="lead.bulk_deleted", details={"count": len(ids)})
        db.commit()
    return {"deleted": len(ids)}


@router.post("/bulk-update")
def bulk_update(
    body: BulkUpdate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    changes = body.model_dump(exclude={"ids"}, exclude_unset=True)
    changes = {k: v for k, v in changes.items() if v is not None}
    if not changes:
        raise HTTPException(422, "Nothing to update")
    _check_assignee(db, ctx, changes.get("assigned_to"))

    ids = db.scalars(
        select(Lead.id).where(Lead.id.in_(body.ids), Lead.organization_id == ctx.organization_id)
    ).all()
    if ids:
        db.execute(update(Lead).where(Lead.id.in_(ids)).values(**changes))
        log_activity(
            db,
            ctx,
            entity_type="lead",
            action="lead.bulk_updated",
            details={"count": len(ids), "fields": sorted(changes)},
        )
        db.commit()
    return {"updated": len(ids)}


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(
    lead_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Lead:
    return _get_lead(db, ctx, lead_id)


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: uuid.UUID,
    body: LeadUpdate,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Lead:
    lead = _get_lead(db, ctx, lead_id)
    changes = body.model_dump(exclude_unset=True)
    if "assigned_to" in changes:
        _check_assignee(db, ctx, changes["assigned_to"])

    diff = {}
    for field, new in changes.items():
        old = getattr(lead, field)
        if old != new:
            diff[field] = [_jsonable(old), _jsonable(new)]
            setattr(lead, field, new)
    if diff:
        log_activity(
            db,
            ctx,
            entity_type="lead",
            entity_id=lead.id,
            action="lead.updated",
            details={"changed": diff},
        )
    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: uuid.UUID,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
) -> Response:
    lead = _get_lead(db, ctx, lead_id)
    log_activity(
        db,
        ctx,
        entity_type="lead",
        entity_id=lead.id,
        action="lead.deleted",
        details={"name": lead.name},
    )
    db.delete(lead)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{lead_id}/activity", response_model=list[ActivityOut])
def lead_activity(
    lead_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ActivityOut]:
    _get_lead(db, ctx, lead_id)
    rows = db.execute(
        select(ActivityLog, Profile.full_name)
        .outerjoin(Profile, Profile.id == ActivityLog.actor_id)
        .where(
            ActivityLog.organization_id == ctx.organization_id,
            ActivityLog.entity_type == "lead",
            ActivityLog.entity_id == lead_id,
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
    ).all()
    return [
        ActivityOut(
            id=log.id,
            action=log.action,
            details=log.details,
            actor_name=name,
            created_at=log.created_at,
        )
        for log, name in rows
    ]