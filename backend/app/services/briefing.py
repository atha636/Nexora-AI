"""The daily briefing: a short, factual summary of what needs attention.

Deliberately built from database queries and the analytics engine, not from an AI model, so it is
instant, free, always consistent with the dashboard, and cannot make anything up.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.analyst.engine import run_query
from app.analyst.spec import AnalyticsQuery
from app.api.deps import ROLE_RANK, AuthContext
from app.db.models import ApprovalRequest, Lead, WorkflowExecution

HIGH_PRIORITY_QUIET_DAYS = 7


def _item(key: str, title: str, value: str, detail: str, tone: str, href: str) -> dict:
    return {"key": key, "title": title, "value": value, "detail": detail, "tone": tone, "href": href}


def build_briefing(db: Session, ctx: AuthContext) -> dict:
    org = ctx.organization_id
    now = datetime.now(timezone.utc)
    items: list[dict] = []

    new_leads = db.scalar(select(func.count()).select_from(Lead).where(Lead.organization_id == org, Lead.created_at >= now - timedelta(days=7))) or 0
    items.append(_item("new_leads", "New leads this week", str(new_leads), "Created in the last 7 days", "neutral", "/leads"))

    quiet = db.scalar(
        select(func.count()).select_from(Lead).where(
            Lead.organization_id == org,
            Lead.priority == "high",
            Lead.status.notin_(("won", "lost")),
            or_(Lead.last_contacted_at.is_(None), Lead.last_contacted_at < now - timedelta(days=HIGH_PRIORITY_QUIET_DAYS)),
        )
    ) or 0
    items.append(
        _item(
            "quiet_high_priority", "High-priority leads to contact", str(quiet),
            f"Not contacted in {HIGH_PRIORITY_QUIET_DAYS}+ days (or never)", "warn" if quiet else "good", "/leads?priority=high",
        )
    )

    pending_q = select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.organization_id == org, ApprovalRequest.status == "pending")
    if ROLE_RANK[ctx.role] < ROLE_RANK["manager"]:
        pending_q = pending_q.where(ApprovalRequest.requested_by == ctx.user.id)
    pending = db.scalar(pending_q) or 0
    items.append(
        _item("pending_approvals", "Waiting for approval", str(pending), "Requests that need a decision" if ROLE_RANK[ctx.role] >= 1 else "Your requests awaiting a manager", "warn" if pending else "good", "/approvals")
    )

    failed = db.scalar(
        select(func.count()).select_from(WorkflowExecution).where(
            WorkflowExecution.organization_id == org, WorkflowExecution.status == "failed", WorkflowExecution.created_at >= now - timedelta(days=7)
        )
    ) or 0
    items.append(_item("failed_runs", "Failed automation runs", str(failed), "In the last 7 days. Retry them from Workflows", "warn" if failed else "good", "/workflows"))

    rev = run_query(db, org, AnalyticsQuery(metric="revenue", period="last_month", compare_to_previous=True, group_by="city", limit=1))
    prev = rev["previous_total"] or 0
    change = rev["total"] - prev
    pct = f"{change / prev * 100:+.0f}%" if prev else "n/a"
    items.append(
        _item(
            "revenue", f"Revenue, {rev['period']['label'].replace('Last month ', '').strip('()')}", f"{rev['total']:,.0f}",
            f"{pct} vs the month before", "good" if change >= 0 else "warn", "/analytics",
        )
    )
    return {"generated_at": now.isoformat(), "items": items}