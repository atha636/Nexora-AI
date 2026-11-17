"""Runs the agent for one user message and saves everything it did.

The API layer calls `run_chat`. This module owns the database side: conversations, messages,
the run record (for observability) and one row per tool call.
"""

import logging
import re
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.graph import build_agent_graph, initial_state
from app.agent.nodes import AgentDeps, ToolRecord
from app.agent.prompts import build_analyst_prompt, build_system_prompt
from app.agent.tools import TOOLS, ToolContext
from app.api.deps import AuthContext, log_activity
from app.db.models import AgentRun, Conversation, Message, ToolExecution, utcnow
from app.services.embeddings import Embedder
from app.services.llm import ChatLLM, LLMError

log = logging.getLogger(__name__)

HISTORY_MESSAGES = 12  # how many earlier messages the model sees (keeps cost and latency down)
MEMORY_CHARS = 2500
UNEXPECTED = "The assistant ran into an unexpected problem. Please try again."


class ConversationNotFound(Exception):
    pass


class AgentFailure(Exception):
    """Something other than the model failed. The message is safe to show to the user."""


@dataclass
class ChatOutcome:
    conversation: Conversation
    run: AgentRun
    user_message: Message
    assistant_message: Message
    records: list[ToolRecord]


def get_conversation(db: Session, ctx: AuthContext, conversation_id: uuid.UUID) -> Conversation:
    """Conversations are private to the user who started them, inside their organization."""
    convo = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.organization_id == ctx.organization_id,
            Conversation.user_id == ctx.user.id,
        )
    )
    if convo is None:
        raise ConversationNotFound
    return convo


# ---------------------------------------------------------------- history
def _memory_note(blocks: list | None) -> str:
    """A compact reminder of the data an earlier reply showed, so follow-ups like "email those
    leads" can be resolved. It is rebuilt from our own database rows, not from model output."""
    lines: list[str] = []
    for block in blocks or []:
        if block.get("type") == "leads":
            for lead in block["data"].get("leads", [])[:25]:
                lines.append(
                    f'- id={lead["id"]} {lead["name"]} | {lead.get("company") or "-"} | {lead.get("city") or "-"} '
                    f'| {lead["priority"]} | {lead["status"]}'
                )
        elif block.get("type") == "email_drafts":
            for d in block["data"].get("drafts", [])[:10]:
                lines.append(f'- email draft id={d["id"]} for {d["lead_name"]}: "{d["subject"]}" ({d["status"]})')
        elif block.get("type") == "lead_saved":
            lead = block["data"]["lead"]
            lines.append(f'- id={lead["id"]} {lead["name"]} | {lead["priority"]} | {lead["status"]}')
    if not lines:
        return ""
    note = "\n".join(lines)[:MEMORY_CHARS]
    return "\n\n[Records shown to the user with this reply. Use these ids for follow-up requests:\n" + note + "\n]"


def _history(db: Session, conversation_id: uuid.UUID) -> list[dict]:
    rows = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc(), Message.role)
            .limit(HISTORY_MESSAGES)
        )
    )
    rows.reverse()
    out = []
    for m in rows:
        content = m.content + (_memory_note(m.blocks) if m.role == "assistant" else "")
        out.append({"role": m.role, "content": content})
    return out


# ---------------------------------------------------------------- blocks for the UI
_RESULT_KINDS = {"leads", "lead_saved", "sales_summary", "lead_analytics", "analytics_result", "email_drafts", "approval_requests"}


def build_blocks(records: list[ToolRecord], sources: list[dict], answer: str) -> list[dict]:
    cited = {int(n) for group in re.findall(r"\[(\d+(?:\s*,\s*\d+)*)\]", answer) for n in re.split(r"\s*,\s*", group)}
    blocks: list[dict] = []
    if records:
        blocks.append(
            {
                "type": "activity",
                "tools": [
                    {"name": r.name, "status": r.status, "duration_ms": r.duration_ms, "summary": r.summary, "error": r.error}
                    for r in records
                ],
            }
        )
    for r in records:
        if r.status == "ok" and r.kind in _RESULT_KINDS and r.data is not None:
            blocks.append({"type": r.kind, "tool": r.name, "data": r.data})
    if sources:
        blocks.append({"type": "sources", "sources": [{**s, "cited": s["number"] in cited} for s in sources]})
    return blocks


# ---------------------------------------------------------------- the run
def _finish_run(db: Session, run: AgentRun, deps: AgentDeps, started: float, steps: int, *, error: str | None) -> None:
    run.status = "failed" if error else "completed"
    run.error_message = error
    run.steps = steps
    run.tool_call_count = len(deps.records)
    if deps.usage_reported:
        run.prompt_tokens, run.completion_tokens = deps.prompt_tokens, deps.completion_tokens
    run.finished_at = utcnow()
    run.duration_ms = int((time.perf_counter() - started) * 1000)
    for r in deps.records:
        db.add(
            ToolExecution(
                run_id=run.id,
                organization_id=run.organization_id,
                sequence=r.sequence,
                tool_name=r.name,
                status=r.status,
                arguments=r.arguments if isinstance(r.arguments, (dict, str)) else None,
                summary=r.summary,
                error_message=r.error,
                duration_ms=r.duration_ms,
            )
        )


def run_chat(
    db: Session,
    ctx: AuthContext,
    llm: ChatLLM,
    embedder: Embedder,
    text: str,
    conversation_id: uuid.UUID | None,
) -> ChatOutcome:
    convo = get_conversation(db, ctx, conversation_id) if conversation_id else None
    history = _history(db, convo.id) if convo else []

    run = AgentRun(
        organization_id=ctx.organization_id,
        user_id=ctx.user.id,
        conversation_id=convo.id if convo else None,
        trace_id=uuid.uuid4().hex,
        model=llm.model,
    )
    db.add(run)
    db.commit()  # saved before running, so even a crash leaves a trace

    deps = AgentDeps(
        llm=llm,
        tool_ctx=ToolContext(db=db, auth=ctx, embedder=embedder, llm=llm),
        tools=TOOLS,
        system_prompt=build_system_prompt(ctx.user.full_name, ctx.role, _org_name(db, ctx)),
    )
    started = time.perf_counter()
    try:
        final = build_agent_graph(deps).invoke(
            initial_state([*history, {"role": "user", "content": text}]),
            config={"recursion_limit": 25},  # backstop; Limits stops the loop long before this
        )
    except LLMError as e:
        _record_failure(db, run, deps, started, str(e))
        raise
    except Exception as e:  # noqa: BLE001
        log.error("Agent run %s failed: %s", run.trace_id, type(e).__name__)
        _record_failure(db, run, deps, started, UNEXPECTED)
        raise AgentFailure(UNEXPECTED) from None

    answer = (final.get("final") or "").strip()
    now = utcnow()
    if convo is None:
        convo = Conversation(
            organization_id=ctx.organization_id,
            user_id=ctx.user.id,
            title=" ".join(text.split())[:60] or "New conversation",
        )
        db.add(convo)
        db.flush()
        run.conversation_id = convo.id
    convo.updated_at = now
    user_msg = Message(conversation_id=convo.id, organization_id=ctx.organization_id, role="user", content=text, created_at=now)
    assistant_msg = Message(
        conversation_id=convo.id,
        organization_id=ctx.organization_id,
        role="assistant",
        content=answer,
        blocks=build_blocks(deps.records, deps.tool_ctx.sources, answer),
        run_id=run.id,
        created_at=now + timedelta(milliseconds=1),
    )
    db.add_all([user_msg, assistant_msg])
    _finish_run(db, run, deps, started, final["steps"], error=None)
    log_activity(db, ctx, entity_type="agent_run", entity_id=run.id, action="agent.run")
    db.commit()
    for obj in (convo, run, user_msg, assistant_msg):
        db.refresh(obj)
    return ChatOutcome(convo, run, user_msg, assistant_msg, deps.records)


def _record_failure(db: Session, run: AgentRun, deps: AgentDeps, started: float, message: str) -> None:
    db.rollback()
    run = db.merge(run)
    _finish_run(db, run, deps, started, len(deps.records), error=message)
    db.commit()


def _org_name(db: Session, ctx: AuthContext) -> str:
    from app.db.models import Organization

    return db.scalar(select(Organization.name).where(Organization.id == ctx.organization_id)) or "your company"


# ---------------------------------------------------------------- analyst mode (stateless)
@dataclass
class AnalysisOutcome:
    run: AgentRun
    answer: str
    results: list[dict]  # one analytics result per query_analytics call that succeeded
    records: list[ToolRecord]


def run_analysis(db: Session, ctx: AuthContext, llm: ChatLLM, embedder: Embedder, question: str) -> AnalysisOutcome:
    """Answers one analytics question. Same graph and guards as the chat agent, but the only tool
    is query_analytics (read-only) and nothing is stored in a conversation."""
    run = AgentRun(
        organization_id=ctx.organization_id,
        user_id=ctx.user.id,
        conversation_id=None,
        trace_id=uuid.uuid4().hex,
        model=llm.model,
    )
    db.add(run)
    db.commit()
    deps = AgentDeps(
        llm=llm,
        tool_ctx=ToolContext(db=db, auth=ctx, embedder=embedder),
        tools={"query_analytics": TOOLS["query_analytics"]},
        system_prompt=build_analyst_prompt(ctx.user.full_name, ctx.role, _org_name(db, ctx)),
    )
    started = time.perf_counter()
    try:
        final = build_agent_graph(deps).invoke(
            initial_state([{"role": "user", "content": question}]), config={"recursion_limit": 25}
        )
    except LLMError as e:
        _record_failure(db, run, deps, started, str(e))
        raise
    except Exception as e:  # noqa: BLE001
        log.error("Analyst run %s failed: %s", run.trace_id, type(e).__name__)
        _record_failure(db, run, deps, started, UNEXPECTED)
        raise AgentFailure(UNEXPECTED) from None
    answer = (final.get("final") or "").strip()
    _finish_run(db, run, deps, started, final["steps"], error=None)
    log_activity(db, ctx, entity_type="agent_run", entity_id=run.id, action="agent.run")
    db.commit()
    db.refresh(run)
    results = [r.data for r in deps.records if r.status == "ok" and r.kind == "analytics_result" and r.data]
    return AnalysisOutcome(run, answer, results, deps.records)