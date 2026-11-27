"""Reports: one summary for the Reports page (and its print/PDF view), plus CSV exports for managers."""

import csv
import io
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.core.ratelimit import rate_limit
from app.db.models import Lead, Organization, Profile, Sale, Task
from app.schemas.report import PeriodFigures, ReportSummary, TaskFigures
from app.services import analytics as svc
from app.db.session import get_db

router = APIRouter(prefix="/reports", tags=["reports"])

Months = Query(6, ge=1, le=24, description="How many calendar months to include")
MAX_EXPORT_ROWS = 5000


def csv_cell(value: object) -> str:
    """Spreadsheets run text starting with = + - @ (or a tab/CR) as a formula, so those cells get a leading apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _csv_response(name: str, header: list[str], rows: list[list[object]]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_ALL)
    writer.writerow(header)
    for row in rows:
        writer.writerow([csv_cell(v) for v in row])
    # The BOM makes Excel read names in Hindi and other scripts correctly.
    body = "﻿" + buf.getvalue()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Response(
        body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}-{stamp}.csv"', "Cache-Control": "no-store"},
    )


@router.get("/summary", response_model=ReportSummary)
def report_summary(
    months: int = Months,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ReportSummary:
    org = ctx.organization_id
    keys = svc.month_keys(months)
    monthly = svc.monthly_revenue(db, org, months)
    acquisition = svc.lead_acquisition(db, org, months)
    new_leads = sum(m.created for m in acquisition)
    won = sum(m.won for m in acquisition)
    revenue = round(sum(m.revenue for m in monthly), 2)
    deals = sum(m.deals for m in monthly)

    now = datetime.now(timezone.utc)
    start = svc._window_start(months)
    open_q = (Task.organization_id == org, Task.status == "open")
    tasks = TaskFigures(
        open=db.scalar(select(func.count()).select_from(Task).where(*open_q)) or 0,
        overdue=db.scalar(select(func.count()).select_from(Task).where(*open_q, Task.due_at < now)) or 0,
        completed_in_period=db.scalar(
            select(func.count()).select_from(Task).where(Task.organization_id == org, Task.status == "done", Task.completed_at >= start)
        )
        or 0,
    )
    organization = db.get(Organization, org)
    return ReportSummary(
        organization=organization.name if organization else "",
        months=months,
        period_start=keys[0],
        period_end=keys[-1],
        generated_at=now,
        period=PeriodFigures(
            new_leads=new_leads,
            won_of_new=won,
            conversion_rate=round(won * 100 / new_leads, 1) if new_leads else 0.0,
            revenue=revenue,
            deals=deals,
            average_deal=round(revenue / deals, 2) if deals else 0.0,
        ),
        tasks=tasks,
        monthly_revenue=monthly,
        acquisition=acquisition,
        revenue_by_city=svc.revenue_by_city(db, org, months),
        by_salesperson=svc.sales_performance(db, org, months),
        leads_by_status=svc.leads_by_status(db, org),
        leads_by_source=svc.leads_by_source(db, org),
        leads_by_city=svc.leads_by_city(db, org, 10),
    )


@router.get("/leads.csv", dependencies=[Depends(rate_limit("export", 10))])
def export_leads(
    status: Literal["new", "contacted", "qualified", "won", "lost"] | None = None,
    priority: Literal["low", "medium", "high"] | None = None,
    city: str | None = Query(None, max_length=80),
    ctx: AuthContext = Depends(require_role("manager")),  # leads hold personal contact details
    db: Session = Depends(get_db),
) -> Response:
    q = (
        select(Lead, Profile.full_name)
        .outerjoin(Profile, Profile.id == Lead.assigned_to)
        .where(Lead.organization_id == ctx.organization_id)
        .order_by(Lead.created_at.desc())
        .limit(MAX_EXPORT_ROWS)
    )
    if status:
        q = q.where(Lead.status == status)
    if priority:
        q = q.where(Lead.priority == priority)
    if city:
        q = q.where(func.lower(Lead.city) == city.strip().lower())
    rows = db.execute(q).all()
    log_activity(db, ctx, entity_type="report", action="report.exported", details={"report": "leads", "rows": len(rows)})
    db.commit()
    header = ["Name", "Email", "Phone", "Company", "City", "Source", "Status", "Priority", "Assigned to", "Last contacted", "Created"]
    data = [
        [l.name, l.email, l.phone, l.company, l.city, l.source, l.status, l.priority, owner, l.last_contacted_at, l.created_at]
        for l, owner in rows
    ]
    return _csv_response("nexora-leads", header, data)


@router.get("/sales.csv", dependencies=[Depends(rate_limit("export", 10))])
def export_sales(
    months: int = Months,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
) -> Response:
    rows = db.execute(
        select(Sale, Lead.name, Lead.city, Profile.full_name)
        .outerjoin(Lead, Lead.id == Sale.lead_id)
        .outerjoin(Profile, Profile.id == Sale.salesperson_id)
        .where(Sale.organization_id == ctx.organization_id, Sale.sold_at >= svc._window_start(months))
        .order_by(Sale.sold_at.desc())
        .limit(MAX_EXPORT_ROWS)
    ).all()
    log_activity(db, ctx, entity_type="report", action="report.exported", details={"report": "sales", "rows": len(rows)})
    db.commit()
    header = ["Sold on", "Amount", "Lead", "City", "Salesperson"]
    data = [[s.sold_at, f"{s.amount:.2f}", lead, city, person] for s, lead, city, person in rows]
    return _csv_response("nexora-sales", header, data)