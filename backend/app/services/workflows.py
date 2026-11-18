"""Workflow automation, orchestrated with LangGraph.

A run is a small state machine:  check conditions -> run action 1 -> run action 2 -> ... -> done.
Every step is committed to the `workflow_executions` row, which doubles as the checkpoint:
  * `cursor` is the next action, so a failed run can be retried from the exact step that failed;
  * a run that asked for human approval stops in `waiting_approval` and is finished later by the
    decision (see `on_approval_finished`), never by itself;
  * the definition is snapshotted into the run, so editing the workflow can't change a run in flight.

Safety: the only actions are drafting an email, asking for approval, and updating a lead's status or
priority. None of them can send an email. Sending still needs an approved ApprovalRequest.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, AuthContext, log_activity
from app.db.models import (
    ApprovalRequest,
    EmailDraft,
    Lead,
    Organization,
    OrganizationMember,
    Profile,
    Workflow,
    WorkflowExecution,
    utcnow,
)
from app.services.approvals import ApprovalError, request_email_approval
from app.services.email_drafts import create_draft
from app.services.llm import LLMError, LLMNotConfigured

log = logging.getLogger(__name__)

STEP_ATTEMPTS = 2  # an AI call that fails is tried once more before the step fails
MAX_RUNS = 5  # first run + retries; stops endless manual retrying of a broken run
FINAL = ("completed", "failed", "cancelled", "skipped")


class WorkflowError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code, self.message = status_code, message


class StepError(Exception):
    """An action failed. The message is safe to show to users."""


# ---------------------------------------------------------------- conditions
def _days_since(lead: Lead) -> int | None:
    if lead.last_contacted_at is None:
        return None
    t = lead.last_contacted_at
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return max((datetime.now(timezone.utc) - t).days, 0)


def check_conditions(lead: Lead, conditions: list[dict]) -> str | None:
    """None if every condition holds, otherwise a short reason."""
    for c in conditions:
        f, op, v = c["field"], c["op"], c["value"]
        if f in ("priority", "status"):
            ok = (getattr(lead, f) == v) == (op == "eq")
        elif f in ("city", "source"):
            ok = ((getattr(lead, f) or "").casefold() == str(v).casefold()) == (op == "eq")
        elif f == "days_since_contact":
            d = _days_since(lead)
            ok = (d is None or d >= v) if op == "gte" else (d is not None and d <= v)  # never contacted counts as "long ago"
        else:  # has_email
            ok = bool(lead.email) == v
        if not ok:
            return f"Condition not met: {f.replace('_', ' ')} {op} {v}"
    return None


# ---------------------------------------------------------------- creating runs
def create_execution(db: Session, ctx: AuthContext, wf: Workflow, lead: Lead, source: str) -> WorkflowExecution:
    ex = WorkflowExecution(
        id=uuid.uuid4(),
        organization_id=ctx.organization_id,
        workflow_id=wf.id,
        workflow_name=wf.name,
        lead_id=lead.id,
        lead_name=lead.name,
        created_by=ctx.user.id,
        trigger_source=source,
        status="queued",
        definition={"conditions": wf.conditions, "actions": wf.actions},
        context={},
        steps=[],
    )
    db.add(ex)
    db.flush()
    return ex


def trigger_lead_created(db: Session, ctx: AuthContext, lead: Lead) -> list[uuid.UUID]:
    """Queues a run for every active "lead created" workflow whose conditions match. Cheap: no AI
    calls happen here. The caller commits, then starts the runs in the background."""
    ids = []
    flows = db.scalars(
        select(Workflow).where(
            Workflow.organization_id == ctx.organization_id, Workflow.is_active.is_(True), Workflow.trigger_type == "lead_created"
        )
    ).all()
    for wf in flows:
        if check_conditions(lead, wf.conditions) is None:
            ids.append(create_execution(db, ctx, wf, lead, "lead_created").id)
    return ids


# ---------------------------------------------------------------- the graph
class RunState(TypedDict):
    outcome: str  # continue | waiting | done | failed


def _step(ex: WorkflowExecution, i: int, a: dict, status: str, summary: str, started: float, error: str | None = None, tries: int = 1):
    ex.steps = [
        *ex.steps,
        {
            "index": i, "type": a["type"], "status": status, "summary": summary, "error": error,
            "duration_ms": int((time.perf_counter() - started) * 1000), "attempts": tries,
            "at": utcnow().isoformat(),
        },
    ]


def _lead_of(db: Session, ex: WorkflowExecution) -> Lead:
    lead = db.scalar(select(Lead).where(Lead.id == ex.lead_id, Lead.organization_id == ex.organization_id)) if ex.lead_id else None
    if lead is None:
        raise StepError("The lead no longer exists.")
    return lead


def _act_draft(db, ctx, llm, ex, a) -> tuple[str, bool]:
    lead = _lead_of(db, ex)
    if not lead.email:
        raise StepError("The lead has no email address.")
    org = db.scalar(select(Organization.name).where(Organization.id == ex.organization_id)) or "our company"
    last: LLMError | None = None
    for attempt in range(1, STEP_ATTEMPTS + 1):
        try:
            d = create_draft(db, ctx, llm, lead, org_name=org, tone=a["tone"], purpose=a["purpose"], instructions=a.get("instructions"), via="workflow")
            ex.context = {**ex.context, "draft_id": str(d.id)}
            return f'Wrote a {a["tone"]} draft: "{d.subject}"', False
        except LLMNotConfigured as e:
            raise StepError(str(e)) from None
        except LLMError as e:
            db.rollback()
            last = e
    raise StepError(str(last))


def _act_approval(db, ctx, llm, ex, a) -> tuple[str, bool]:
    draft_id = ex.context.get("draft_id")
    draft = db.scalar(select(EmailDraft).where(EmailDraft.id == uuid.UUID(draft_id), EmailDraft.organization_id == ex.organization_id)) if draft_id else None
    if draft is None:
        raise StepError("There is no draft to send for approval.")
    try:
        ap = request_email_approval(db, ctx, draft, via="workflow")
    except ApprovalError as e:
        raise StepError(e.message) from None
    ex.context = {**ex.context, "approval_id": str(ap.id)}
    return "Asked a manager to approve sending the email", True


def _act_update(db, ctx, llm, ex, a) -> tuple[str, bool]:
    lead = _lead_of(db, ex)
    changed = {}
    for f in ("status", "priority"):
        if a.get(f) and getattr(lead, f) != a[f]:
            changed[f] = [getattr(lead, f), a[f]]
            setattr(lead, f, a[f])
    log_activity(db, ctx, entity_type="lead", entity_id=lead.id, action="lead.updated", details={"changed": changed, "via": "workflow"})
    return ("Updated " + ", ".join(f"{k} to {v[1]}" for k, v in changed.items())) if changed else "Nothing to change", False


ACTIONS = {"draft_email": _act_draft, "request_approval": _act_approval, "update_lead": _act_update}


def build_graph(db: Session, ctx: AuthContext, llm, execution_id: uuid.UUID):
    def load() -> WorkflowExecution:
        return db.get(WorkflowExecution, execution_id)

    def finish(ex: WorkflowExecution, status: str, error: str | None = None) -> None:
        ex.status, ex.error_message, ex.finished_at = status, error, utcnow()
        log_activity(db, ctx, entity_type="workflow_execution", entity_id=ex.id, action=f"workflow.{status}", details={"workflow": ex.workflow_name})
        db.commit()

    def check(state: RunState) -> RunState:
        ex = load()
        if ex.cursor > 0 or ex.steps:  # resuming a retry: the conditions already passed
            return {"outcome": "continue"}
        try:
            reason = check_conditions(_lead_of(db, ex), ex.definition["conditions"])
        except StepError as e:
            finish(ex, "failed", str(e))
            return {"outcome": "failed"}
        if reason:
            finish(ex, "skipped", reason)
            return {"outcome": "done"}
        return {"outcome": "continue"}

    def step(state: RunState) -> RunState:
        ex = load()
        actions = ex.definition["actions"]
        if ex.cursor >= len(actions):
            finish(ex, "completed")
            return {"outcome": "done"}
        a, i, started = actions[ex.cursor], ex.cursor, time.perf_counter()
        try:
            summary, waiting = ACTIONS[a["type"]](db, ctx, llm, ex, a)
        except StepError as e:
            db.rollback()
            ex = load()
            _step(ex, i, a, "error", "Failed", started, error=str(e))
            finish(ex, "failed", str(e))
            return {"outcome": "failed"}
        except Exception as e:  # noqa: BLE001 - a bug in one step must not leave the run "running" forever
            log.error("Workflow %s step %d crashed: %s", ex.trace_id, i, type(e).__name__)
            db.rollback()
            ex = load()
            _step(ex, i, a, "error", "Failed", started, error="Unexpected error while running this step.")
            finish(ex, "failed", "Unexpected error while running this step.")
            return {"outcome": "failed"}
        ex.cursor = i + 1
        if waiting:
            _step(ex, i, a, "waiting", summary, started)
            ex.status = "waiting_approval"
            log_activity(db, ctx, entity_type="workflow_execution", entity_id=ex.id, action="workflow.waiting_approval", details={"workflow": ex.workflow_name})
            db.commit()
            return {"outcome": "waiting"}
        _step(ex, i, a, "ok", summary, started)
        db.commit()
        return {"outcome": "continue"}

    g = StateGraph(RunState)
    g.add_node("check", check)
    g.add_node("step", step)
    g.add_edge(START, "check")
    g.add_conditional_edges("check", lambda s: "step" if s["outcome"] == "continue" else END, {"step": "step", END: END})
    g.add_conditional_edges("step", lambda s: "step" if s["outcome"] == "continue" else END, {"step": "step", END: END})
    return g.compile()


def get_execution(db: Session, ctx: AuthContext, execution_id: uuid.UUID) -> WorkflowExecution:
    ex = db.scalar(select(WorkflowExecution).where(WorkflowExecution.id == execution_id, WorkflowExecution.organization_id == ctx.organization_id))
    if ex is None:
        raise WorkflowError(404, "Run not found")
    return ex


def _claim(db: Session, ex: WorkflowExecution, allowed: tuple[str, ...]) -> None:
    """Moves the run to `running`, only if it is in an allowed state, so two requests can't both run it."""
    res = db.execute(
        update(WorkflowExecution)
        .where(WorkflowExecution.id == ex.id, WorkflowExecution.status.in_(allowed))
        .values(status="running", started_at=ex.started_at or utcnow(), attempts=ex.attempts + 1, finished_at=None, error_message=None)
    )
    if res.rowcount != 1:
        db.rollback()
        raise WorkflowError(409, "This run can't be started in its current state.")
    db.commit()
    db.expire_all()


def run_execution(db: Session, ctx: AuthContext, llm, execution_id: uuid.UUID, *, retry: bool = False) -> WorkflowExecution:
    ex = get_execution(db, ctx, execution_id)
    if retry:
        if ex.attempts >= MAX_RUNS:
            raise WorkflowError(409, f"This run has already been tried {MAX_RUNS} times.")
        _claim(db, ex, ("failed",))
    else:
        _claim(db, ex, ("queued",))
    build_graph(db, ctx, llm, execution_id).invoke({"outcome": "continue"}, config={"recursion_limit": 30})
    db.expire_all()
    return db.get(WorkflowExecution, execution_id)


def run_in_background(session_factory, llm, execution_id: uuid.UUID, user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """Runs a queued execution after the HTTP response has been sent."""
    with session_factory() as db:
        user = db.get(Profile, user_id)
        member = db.scalar(select(OrganizationMember).where(OrganizationMember.profile_id == user_id, OrganizationMember.organization_id == org_id))
        if user is None or member is None:
            return
        try:
            run_execution(db, AuthContext(user=user, organization_id=org_id, role=member.role), llm, execution_id)
        except WorkflowError:
            pass  # already started elsewhere
        except Exception as e:  # noqa: BLE001
            log.error("Background workflow run failed: %s", type(e).__name__)


# ---------------------------------------------------------------- cancel / approval hooks
def cancel_execution(db: Session, ctx: AuthContext, execution_id: uuid.UUID) -> WorkflowExecution:
    ex = get_execution(db, ctx, execution_id)
    if ex.status not in ("queued", "waiting_approval", "failed"):
        raise WorkflowError(409, f"A run that is {ex.status.replace('_', ' ')} can't be cancelled.")
    approval_id = ex.context.get("approval_id") if ex.status == "waiting_approval" else None
    if approval_id:  # withdraw the pending request so nothing can be sent afterwards
        res = db.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == uuid.UUID(approval_id), ApprovalRequest.status == "pending")
            .values(status="cancelled", decided_by=ctx.user.id, decided_at=utcnow(), decision_note="Workflow run cancelled")
        )
        if res.rowcount != 1:  # someone decided it a moment ago: let that decision finish the run
            db.rollback()
            raise WorkflowError(409, "The approval was just decided. Refresh to see the result.")
        draft = db.scalar(select(EmailDraft).where(EmailDraft.approval_id == uuid.UUID(approval_id)))
        if draft and draft.status == "pending_approval":
            draft.status = "draft"
    ex.status, ex.finished_at, ex.error_message = "cancelled", utcnow(), "Cancelled by a person."
    log_activity(db, ctx, entity_type="workflow_execution", entity_id=ex.id, action="workflow.cancelled", details={"workflow": ex.workflow_name})
    db.commit()
    db.refresh(ex)
    return ex


def on_approval_finished(db: Session, approval: ApprovalRequest) -> None:
    """Called by the approval service when a request reaches a final state. Finishes the run that
    was waiting for it. Does not commit: the caller does."""
    if approval.status not in ("executed", "failed", "rejected", "cancelled"):
        return
    waiting = db.scalars(
        select(WorkflowExecution).where(WorkflowExecution.organization_id == approval.organization_id, WorkflowExecution.status == "waiting_approval")
    ).all()
    for ex in waiting:
        if ex.context.get("approval_id") != str(approval.id):
            continue
        steps = [dict(s) for s in ex.steps]
        outcome = {
            "executed": ("completed", "ok", "Approved. The email was sent." if not (approval.result or {}).get("simulated") else "Approved. Email send simulated.", None),
            "failed": ("failed", "error", "Approved, but sending failed", approval.error_message or "Sending failed."),
            "rejected": ("cancelled", "error", "Rejected by a manager", "The approval was rejected."),
            "cancelled": ("cancelled", "error", "Approval request cancelled", "The approval request was cancelled."),
        }[approval.status]
        status, step_status, summary, error = outcome
        if steps:
            steps[-1] = {**steps[-1], "status": step_status, "summary": summary, "error": error}
        ex.steps = steps
        ex.status, ex.error_message, ex.finished_at = status, error, utcnow()