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
from app.db.models import ApprovalRequest, Lead, Task, WorkflowExecution
from app.services.llm import LLMClient, LLMError

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

    mine = (Task.organization_id == org, Task.assigned_to == ctx.user.id, Task.status == "open")
    overdue = db.scalar(select(func.count()).select_from(Task).where(*mine, Task.due_at < now)) or 0
    soon = db.scalar(select(func.count()).select_from(Task).where(*mine, Task.due_at >= now, Task.due_at < now + timedelta(hours=24))) or 0
    items.append(
        _item(
            "my_tasks", "Your overdue tasks", str(overdue),
            f"{soon} more due in the next 24 hours" if soon else "Nothing else due in the next 24 hours",
            "warn" if overdue else "good", "/tasks",
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


SUMMARY_SYSTEM = (
    "You write the short morning summary for a sales and operations team. Use ONLY the figures given. "
    "Never invent or change a number, and never mention anything that is not listed. "
    "Write 2 or 3 plain sentences with no greeting and no bullet points: say what is going well, then what needs attention first."
)


def plain_summary(items: list[dict]) -> str:
    """The same idea without AI: calm, factual, built from the figures in code. Used when the model is unavailable."""
    by = {i["key"]: i for i in items}
    warn = [i for i in items if i["tone"] == "warn"]
    if not warn:
        return "Nothing needs attention right now. Your pipeline, approvals and automations are all on track."
    parts = [f"{i['title'].lower()}: {i['value']}" for i in warn[:3]]
    first = warn[0]
    rev = by.get("revenue")
    tail = f" Revenue last month was {rev['value']} ({rev['detail']})." if rev else ""
    return f"Needs attention: {'; '.join(parts)}. Start with {first['title'].lower()}.{tail}"


def ai_summary(items: list[dict], llm: LLMClient, language: str = "en") -> dict:
    """Ask the model to phrase the figures. Only aggregate numbers are sent: no names, emails or company data."""
    facts = "\n".join(f"- {i['title']}: {i['value']} ({i['detail']})" for i in items)
    system = SUMMARY_SYSTEM + (" Write the summary in Hindi (Devanagari script)." if language == "hi" else "")
    try:
        out = llm.complete(system, facts, max_tokens=300)
    except LLMError:
        return {"summary": plain_summary(items), "ai": False}
    return {"summary": out.text, "ai": True}