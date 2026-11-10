"""Business metrics, computed from the database for ONE organization.

Every query here filters on `organization_id`, and that id always comes from the
authenticated user's membership, never from the request.

Monthly bucketing is done in Python rather than SQL so the same code runs on
SQLite (dev/tests) and Postgres (production). That is fine at the scale this app
targets; very large tenants would move it into SQL (`date_trunc`) later.
"""

import uuid
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import ActivityLog, Lead, OrganizationMember, Profile, Sale
from app.schemas.analytics import (
    ActivityItem,
    Kpis,
    LabelCount,
    LabelRevenue,
    MonthLeads,
    MonthRevenue,
    SalesPerson,
)

UNKNOWN = "Unknown"


# ---------- helpers ----------
def _month_key(dt: datetime) -> str:
    return f"{dt.year}-{dt.month:02d}"


def month_keys(months: int, now: datetime | None = None) -> list[str]:
    """The last `months` calendar months, oldest first, ending with the current month."""
    now = now or datetime.now(timezone.utc)
    year, month = now.year, now.month
    keys: list[str] = []
    for _ in range(months):
        keys.append(f"{year}-{month:02d}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(keys))


def _window_start(months: int, now: datetime | None = None) -> datetime:
    first = month_keys(months, now)[0]
    year, month = (int(p) for p in first.split("-"))
    return datetime(year, month, 1, tzinfo=timezone.utc)


def _pct(part: int, whole: int) -> float:
    return round(part * 100 / whole, 1) if whole else 0.0


# ---------- KPIs ----------
def kpis(db: Session, org_id: uuid.UUID) -> Kpis:
    total_leads = db.scalar(select(func.count()).select_from(Lead).where(Lead.organization_id == org_id)) or 0
    won = (
        db.scalar(
            select(func.count()).select_from(Lead).where(Lead.organization_id == org_id, Lead.status == "won")
        )
        or 0
    )
    revenue = db.scalar(select(func.coalesce(func.sum(Sale.amount), 0)).where(Sale.organization_id == org_id)) or 0
    return Kpis(
        total_leads=total_leads,
        won_leads=won,
        total_revenue=float(revenue),
        conversion_rate=_pct(won, total_leads),
        active_workflows=0,
        pending_approvals=0,
        documents_indexed=0,
    )


# ---------- time series ----------
def monthly_revenue(db: Session, org_id: uuid.UUID, months: int) -> list[MonthRevenue]:
    rows = db.execute(
        select(Sale.sold_at, Sale.amount).where(
            Sale.organization_id == org_id, Sale.sold_at >= _window_start(months)
        )
    ).all()
    revenue: dict[str, float] = defaultdict(float)
    deals: dict[str, int] = defaultdict(int)
    for sold_at, amount in rows:
        key = _month_key(sold_at)
        revenue[key] += float(amount)
        deals[key] += 1
    return [
        MonthRevenue(month=k, revenue=round(revenue[k], 2), deals=deals[k]) for k in month_keys(months)
    ]


def lead_acquisition(db: Session, org_id: uuid.UUID, months: int) -> list[MonthLeads]:
    """Per month: leads created, and how many of that cohort are won today (cohort conversion)."""
    rows = db.execute(
        select(Lead.created_at, Lead.status).where(
            Lead.organization_id == org_id, Lead.created_at >= _window_start(months)
        )
    ).all()
    created: dict[str, int] = defaultdict(int)
    won: dict[str, int] = defaultdict(int)
    for created_at, status in rows:
        key = _month_key(created_at)
        created[key] += 1
        if status == "won":
            won[key] += 1
    return [
        MonthLeads(month=k, created=created[k], won=won[k], conversion_rate=_pct(won[k], created[k]))
        for k in month_keys(months)
    ]


# ---------- breakdowns ----------
def _label_counts(db: Session, org_id: uuid.UUID, column, limit: int | None = None) -> list[LabelCount]:
    label = func.coalesce(column, UNKNOWN)
    query = (
        select(label, func.count())
        .where(Lead.organization_id == org_id)
        .group_by(label)
        .order_by(func.count().desc(), label)
    )
    if limit:
        query = query.limit(limit)
    return [LabelCount(label=name, count=count) for name, count in db.execute(query).all()]


def leads_by_city(db: Session, org_id: uuid.UUID, limit: int | None = 8) -> list[LabelCount]:
    return _label_counts(db, org_id, Lead.city, limit)


def leads_by_status(db: Session, org_id: uuid.UUID) -> list[LabelCount]:
    return _label_counts(db, org_id, Lead.status)


def leads_by_source(db: Session, org_id: uuid.UUID, limit: int | None = 8) -> list[LabelCount]:
    return _label_counts(db, org_id, Lead.source, limit)


def revenue_by_city(db: Session, org_id: uuid.UUID, months: int, limit: int = 8) -> list[LabelRevenue]:
    # Outer join: a sale whose lead was deleted still counts, under "Unknown".
    label = func.coalesce(Lead.city, UNKNOWN)
    total = func.sum(Sale.amount)
    rows = db.execute(
        select(label, total, func.count(Sale.id))
        .select_from(Sale)
        .outerjoin(Lead, Lead.id == Sale.lead_id)
        .where(Sale.organization_id == org_id, Sale.sold_at >= _window_start(months))
        .group_by(label)
        .order_by(total.desc())
        .limit(limit)
    ).all()
    return [LabelRevenue(label=name, revenue=round(float(rev), 2), deals=n) for name, rev, n in rows]


def sales_performance(db: Session, org_id: uuid.UUID, months: int) -> list[SalesPerson]:
    """One row per team member: revenue in the window, plus conversion of the leads assigned to them."""
    members = db.execute(
        select(Profile.id, Profile.full_name)
        .join(OrganizationMember, OrganizationMember.profile_id == Profile.id)
        .where(OrganizationMember.organization_id == org_id)
    ).all()

    sales = db.execute(
        select(Sale.salesperson_id, func.sum(Sale.amount), func.count(Sale.id))
        .where(Sale.organization_id == org_id, Sale.sold_at >= _window_start(months))
        .group_by(Sale.salesperson_id)
    ).all()
    sale_map = {pid: (float(total), n) for pid, total, n in sales}

    assigned_rows = db.execute(
        select(Lead.assigned_to, func.count())
        .where(Lead.organization_id == org_id, Lead.assigned_to.is_not(None))
        .group_by(Lead.assigned_to)
    ).all()
    assigned = {pid: n for pid, n in assigned_rows}
    won_rows = db.execute(
        select(Lead.assigned_to, func.count())
        .where(Lead.organization_id == org_id, Lead.assigned_to.is_not(None), Lead.status == "won")
        .group_by(Lead.assigned_to)
    ).all()
    won = {pid: n for pid, n in won_rows}

    result = []
    for pid, name in members:
        revenue, deals = sale_map.get(pid, (0.0, 0))
        result.append(
            SalesPerson(
                id=pid,
                name=name,
                revenue=round(revenue, 2),
                deals=deals,
                leads_assigned=assigned.get(pid, 0),
                leads_won=won.get(pid, 0),
                conversion_rate=_pct(won.get(pid, 0), assigned.get(pid, 0)),
            )
        )
    result.sort(key=lambda p: (-p.revenue, p.name))
    return result


# ---------- recent activity ----------
_SUMMARIES = {
    "organization.created": "Workspace created",
    "lead.created": "Lead created",
    "lead.updated": "Lead updated",
    "lead.deleted": "Lead deleted",
    "lead.bulk_updated": "Leads updated in bulk",
    "lead.bulk_deleted": "Leads deleted in bulk",
    "member.added": "Teammate added",
    "sale.recorded": "Sale recorded",
    "auth.logout": "Signed out",
}


def _summary(action: str, details: dict | None) -> str:
    base = _SUMMARIES.get(action, action)
    if details and isinstance(details.get("name"), str):
        return f"{base}: {details['name']}"
    if details and isinstance(details.get("count"), int):
        return f"{base} ({details['count']})"
    return base


def recent_activity(db: Session, org_id: uuid.UUID, limit: int = 10) -> list[ActivityItem]:
    rows = db.execute(
        select(ActivityLog, Profile.full_name)
        .outerjoin(Profile, Profile.id == ActivityLog.actor_id)
        # Sign-outs are noise on a business dashboard.
        .where(ActivityLog.organization_id == org_id, ActivityLog.action != "auth.logout")
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        ActivityItem(
            id=log.id,
            action=log.action,
            entity_type=log.entity_type,
            summary=_summary(log.action, log.details),
            actor_name=name,
            created_at=log.created_at,
        )
        for log, name in rows
    ]