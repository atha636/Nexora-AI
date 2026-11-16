"""Compiles an AnalyticsQuery into SELECT-only, organization-scoped SQL, runs it, and shapes the
answer (rows, chart, comparison, notes).

Every statement is built here from fixed pieces. Values from the question (city names, dates)
only ever travel as bound parameters, and `organization_id` is applied to every table touched.
"""

import uuid
from datetime import date

from sqlalchemy import and_, case, extract, func, select
from sqlalchemy.orm import Session

from app.analyst import periods
from app.analyst.executor import run_select
from app.analyst.periods import Period
from app.analyst.spec import (
    DIMENSION_LABELS,
    METRICS,
    AnalyticsError,
    AnalyticsQuery,
    MetricDef,
    validate_for_metric,
)
from app.core.config import get_settings
from app.db.models import Lead, Profile, Sale

UNKNOWN = "Unknown"
LEAD_DIMS = {"city": Lead.city, "source": Lead.source, "priority": Lead.priority, "status": Lead.status}


def _value(metric: str, n: float, x: float) -> float:
    """Final number from the two additive parts: n = how many rows, x = the sum/won count."""
    if metric in ("revenue", "deals", "leads", "won_leads"):
        return round(x, 2)
    return round(x / n, 2) if metric == "avg_deal" and n else (round(100 * x / n, 1) if metric == "conversion_rate" and n else 0.0)


def _build(q: AnalyticsQuery, metric: MetricDef, org_id: uuid.UUID, period: Period, group: str | None):
    sales = metric.table == "sales"
    entity = Sale if sales else Lead
    time_col = Sale.sold_at if sales else Lead.created_at

    if metric.key in ("revenue", "avg_deal"):
        x = func.coalesce(func.sum(Sale.amount), 0)
    elif metric.key == "won_leads" or metric.key == "conversion_rate":
        x = func.coalesce(func.sum(case((Lead.status == "won", 1), else_=0)), 0)
    else:
        x = func.count()
    n = func.count()

    wanted = {group, *(d for d, _ in q.filters)}
    join_lead = sales and bool(wanted & set(LEAD_DIMS))
    join_profile = "salesperson" in wanted

    group_cols: list = []
    if group == "month":
        group_cols = [extract("year", time_col).label("y"), extract("month", time_col).label("m")]
    elif group == "salesperson":
        group_cols = [func.coalesce(Profile.full_name, UNKNOWN).label("g")]
    elif group:
        group_cols = [func.coalesce(LEAD_DIMS[group], UNKNOWN).label("g")]

    stmt = select(*group_cols, n.label("n"), x.label("x")).select_from(entity)
    if join_lead:
        stmt = stmt.outerjoin(Lead, and_(Sale.lead_id == Lead.id, Lead.organization_id == org_id))
    if join_profile:
        owner = Sale.salesperson_id if sales else Lead.assigned_to
        stmt = stmt.outerjoin(Profile, Profile.id == owner)

    stmt = stmt.where(entity.organization_id == org_id)  # the tenant boundary: always first
    start, end = period.bounds()
    if start:
        stmt = stmt.where(time_col >= start)
    if end:
        stmt = stmt.where(time_col < end)
    for dim, value in q.filters:
        col = Profile.full_name if dim == "salesperson" else LEAD_DIMS[dim]
        stmt = stmt.where(col == value if dim in ("priority", "status") else func.lower(col) == value.lower())
    if group_cols:
        stmt = stmt.group_by(*group_cols).limit(get_settings().analytics_max_groups)
    return stmt


def _run(db, q, metric, org_id, period, group) -> dict[str, tuple[float, float]]:
    rows = run_select(db, _build(q, metric, org_id, period, group))
    out: dict[str, tuple[float, float]] = {}
    for r in rows:
        label = f"{int(r.y)}-{int(r.m):02d}" if group == "month" else (r.g if group else "Total")
        out[str(label)] = (float(r.n or 0), float(r.x or 0))
    return out


def _months_between(period: Period, now: date) -> list[str]:
    if period.start is None:
        return []
    last = period.last_day or now
    cur, keys = periods.first_of_month(period.start), []
    while cur <= last and len(keys) < 120:
        keys.append(f"{cur.year}-{cur.month:02d}")
        cur = periods.shift_months(cur, 1)
    return keys


def run_query(db: Session, org_id: uuid.UUID, q: AnalyticsQuery, now: date | None = None) -> dict:
    now = now or periods.today()
    metric = validate_for_metric(q)
    period = periods.resolve(q, now)
    group = q.group_by
    notes: list[str] = []

    current = _run(db, q, metric, org_id, period, group)
    total_parts = _run(db, q, metric, org_id, period, None).get("Total", (0.0, 0.0))
    total = _value(metric.key, *total_parts)

    prev_period = prev = None
    prev_total = None
    if q.compare_to_previous:
        prev_period = periods.previous(period)
        prev = _run(db, q, metric, org_id, prev_period, group)
        prev_total = _value(metric.key, *_run(db, q, metric, org_id, prev_period, None).get("Total", (0.0, 0.0)))

    labels = (set(current) | set(prev or {})) if group else set()
    if group == "month":
        labels |= set(_months_between(period, now))  # show months with no activity as zero
    rows = []
    for label in labels:
        value = _value(metric.key, *current.get(label, (0.0, 0.0)))
        row: dict = {"label": label, "value": value}
        if prev is not None:
            pv = _value(metric.key, *prev.get(label, (0.0, 0.0)))
            row.update(previous=pv, change=round(value - pv, 2), change_pct=round(100 * (value - pv) / pv, 1) if pv else None)
        rows.append(row)

    if prev is not None and prev_total is not None and total != prev_total and metric.unit != "percent":
        delta = total - prev_total
        for r in rows:
            r["contribution_pct"] = round(100 * r["change"] / delta, 1)  # share of the overall change

    if group == "month":
        rows.sort(key=lambda r: r["label"])
    elif prev is not None:
        rows.sort(key=lambda r: (abs(r["change"]), r["label"]), reverse=True)
    else:
        rows.sort(key=lambda r: (-r["value"], r["label"]))

    total_groups = len(rows)
    shown = rows[: q.limit] if group != "month" else rows
    if group and total_groups > len(shown):
        notes.append(f"Showing {len(shown)} of {total_groups} groups.")
    if len(current) >= get_settings().analytics_max_groups:
        notes.append("Too many groups: results were capped and may be incomplete.")
    if metric.table == "sales" and group in ("city", "source", "priority") and UNKNOWN in current:
        notes.append("'Unknown' = deals that are not linked to a lead.")
    if metric.table == "sales" and group in ("city", "source", "priority") or (metric.table == "sales" and q.filters and any(d in ("city", "source", "priority") for d, _ in q.filters)):
        notes.append("City, source and priority come from the lead each deal was linked to.")
    if period.kind in ("this_month", "this_year"):
        notes.append("This period is not finished yet, so numbers are partial.")
    if metric.key == "conversion_rate":
        notes.append("Conversion rate counts leads created in the period that are won now.")
    if q.compare_to_previous and prev_total == 0:
        notes.append("The previous period had no data, so percentage changes are not available.")

    result = {
        "metric": metric.key,
        "metric_label": metric.label,
        "unit": metric.unit,
        "group_by": group,
        "group_label": DIMENSION_LABELS.get(group) if group else None,
        "period": period.describe(),
        "previous_period": prev_period.describe() if prev_period else None,
        "filters": {d: v for d, v in q.filters},
        "total": total,
        "previous_total": prev_total,
        "rows": shown,
        "total_groups": total_groups,
        "truncated": total_groups > len(shown),
        "notes": notes,
        "chart": None,
    }
    if group and shown:
        result["chart"] = {"type": "line" if group == "month" else "bar", "x_key": "label", "y_key": "value"}
    return result
