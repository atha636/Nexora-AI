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


TEXT = {
    "en": {
        "new_leads.t": "New leads this week", "new_leads.d": "Created in the last 7 days",
        "quiet.t": "High-priority leads to contact", "quiet.d": "Not contacted in {days}+ days (or never)",
        "tasks.t": "Your overdue tasks", "tasks.soon": "{n} more due in the next 24 hours", "tasks.none": "Nothing else due in the next 24 hours",
        "approvals.t": "Waiting for approval", "approvals.mgr": "Requests that need a decision", "approvals.own": "Your requests awaiting a manager",
        "failed.t": "Failed automation runs", "failed.d": "In the last 7 days. Retry them from Workflows",
        "revenue.t": "Revenue, {label}", "revenue.d": "{pct} vs the month before", "na": "n/a",
        "plain.ok": "Nothing needs attention right now. Your pipeline, approvals and automations are all on track.",
        "plain.attention": "Needs attention: {parts}. Start with {first}.", "plain.revenue": " Revenue last month was {value} ({detail}).",
    },
    "hi": {
        "new_leads.t": "इस सप्ताह के नए लीड", "new_leads.d": "पिछले 7 दिनों में बनाए गए",
        "quiet.t": "संपर्क करने योग्य उच्च-प्राथमिकता लीड", "quiet.d": "{days}+ दिनों से संपर्क नहीं हुआ (या कभी नहीं)",
        "tasks.t": "आपके अतिदेय कार्य", "tasks.soon": "अगले 24 घंटों में {n} और देय", "tasks.none": "अगले 24 घंटों में और कुछ देय नहीं",
        "approvals.t": "अनुमोदन की प्रतीक्षा में", "approvals.mgr": "ऐसे अनुरोध जिन पर निर्णय चाहिए", "approvals.own": "आपके अनुरोध जो मैनेजर की प्रतीक्षा में हैं",
        "failed.t": "विफल ऑटोमेशन रन", "failed.d": "पिछले 7 दिनों में। इन्हें वर्कफ़्लो से दोबारा चलाएँ",
        "revenue.t": "राजस्व, {label}", "revenue.d": "पिछले महीने की तुलना में {pct}", "na": "लागू नहीं",
        "plain.ok": "अभी किसी चीज़ पर ध्यान देने की ज़रूरत नहीं है। आपकी पाइपलाइन, अनुमोदन और ऑटोमेशन सही चल रहे हैं।",
        "plain.attention": "ध्यान देने योग्य: {parts}। पहले {first} देखें।", "plain.revenue": " पिछले महीने का राजस्व {value} था ({detail})।",
    },
}


def _tx(language: str, key: str, **vars: object) -> str:
    return TEXT.get(language, TEXT["en"])[key].format(**vars)


def _item(key: str, title: str, value: str, detail: str, tone: str, href: str) -> dict:
    return {"key": key, "title": title, "value": value, "detail": detail, "tone": tone, "href": href}


def build_briefing(db: Session, ctx: AuthContext, language: str = "en") -> dict:
    t = lambda key, **v: _tx(language, key, **v)  # noqa: E731
    org = ctx.organization_id
    now = datetime.now(timezone.utc)
    items: list[dict] = []

    new_leads = db.scalar(select(func.count()).select_from(Lead).where(Lead.organization_id == org, Lead.created_at >= now - timedelta(days=7))) or 0
    items.append(_item("new_leads", t("new_leads.t"), str(new_leads), t("new_leads.d"), "neutral", "/leads"))

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
            "quiet_high_priority", t("quiet.t"), str(quiet),
            t("quiet.d", days=HIGH_PRIORITY_QUIET_DAYS), "warn" if quiet else "good", "/leads?priority=high",
        )
    )

    mine = (Task.organization_id == org, Task.assigned_to == ctx.user.id, Task.status == "open")
    overdue = db.scalar(select(func.count()).select_from(Task).where(*mine, Task.due_at < now)) or 0
    soon = db.scalar(select(func.count()).select_from(Task).where(*mine, Task.due_at >= now, Task.due_at < now + timedelta(hours=24))) or 0
    items.append(
        _item(
            "my_tasks", t("tasks.t"), str(overdue),
            t("tasks.soon", n=soon) if soon else t("tasks.none"),
            "warn" if overdue else "good", "/tasks",
        )
    )

    pending_q = select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.organization_id == org, ApprovalRequest.status == "pending")
    if ROLE_RANK[ctx.role] < ROLE_RANK["manager"]:
        pending_q = pending_q.where(ApprovalRequest.requested_by == ctx.user.id)
    pending = db.scalar(pending_q) or 0
    items.append(
        _item("pending_approvals", t("approvals.t"), str(pending), t("approvals.mgr") if ROLE_RANK[ctx.role] >= ROLE_RANK["manager"] else t("approvals.own"), "warn" if pending else "good", "/approvals")
    )

    failed = db.scalar(
        select(func.count()).select_from(WorkflowExecution).where(
            WorkflowExecution.organization_id == org, WorkflowExecution.status == "failed", WorkflowExecution.created_at >= now - timedelta(days=7)
        )
    ) or 0
    items.append(_item("failed_runs", t("failed.t"), str(failed), t("failed.d"), "warn" if failed else "good", "/workflows"))

    rev = run_query(db, org, AnalyticsQuery(metric="revenue", period="last_month", compare_to_previous=True, group_by="city", limit=1))
    prev = rev["previous_total"] or 0
    change = rev["total"] - prev
    pct = f"{change / prev * 100:+.0f}%" if prev else t("na")
    items.append(
        _item(
            "revenue", t("revenue.t", label=rev["period"]["label"].replace("Last month ", "").strip("()")), f"{rev['total']:,.0f}",
            t("revenue.d", pct=pct), "good" if change >= 0 else "warn", "/analytics",
        )
    )
    return {"generated_at": now.isoformat(), "items": items}


SUMMARY_SYSTEM = (
    "You write the short morning summary for a sales and operations team. Use ONLY the figures given. "
    "Never invent or change a number, and never mention anything that is not listed. "
    "Write 2 or 3 plain sentences with no greeting and no bullet points: say what is going well, then what needs attention first."
)


def plain_summary(items: list[dict], language: str = "en") -> str:
    """The same idea without AI: calm, factual, built from the figures in code. Used when the model is unavailable."""
    by = {i["key"]: i for i in items}
    warn = [i for i in items if i["tone"] == "warn"]
    if not warn:
        return _tx(language, "plain.ok")
    parts = [f"{i['title'].lower()}: {i['value']}" for i in warn[:3]]
    first = warn[0]
    rev = by.get("revenue")
    tail = _tx(language, "plain.revenue", value=rev["value"], detail=rev["detail"]) if rev else ""
    return _tx(language, "plain.attention", parts="; ".join(parts), first=first["title"].lower()) + tail


def ai_summary(items: list[dict], llm: LLMClient, language: str = "en") -> dict:
    """Ask the model to phrase the figures. Only aggregate numbers are sent: no names, emails or company data."""
    facts = "\n".join(f"- {i['title']}: {i['value']} ({i['detail']})" for i in items)
    system = SUMMARY_SYSTEM + (" Write the summary in Hindi (Devanagari script)." if language == "hi" else "")
    try:
        out = llm.complete(system, facts, max_tokens=300)
    except LLMError:
        return {"summary": plain_summary(items, language), "ai": False}
    return {"summary": out.text, "ai": True}