import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ratelimit import rate_limit
from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.db.models import Lead, Profile, Workflow, WorkflowExecution
from app.db.session import get_db
from app.schemas.workflow import (
    ExecuteRequest,
    ExecutionBrief,
    ExecutionList,
    ExecutionOut,
    WorkflowCreate,
    WorkflowOut,
    WorkflowUpdate,
)
from app.services import workflows as svc
from app.services.llm import ChatLLM, LLMError, get_chat_llm

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _name(db: Session, user_id: uuid.UUID | None) -> str | None:
    return db.scalar(select(Profile.full_name).where(Profile.id == user_id)) if user_id else None


def workflow_out(db: Session, w: Workflow) -> WorkflowOut:
    count = db.scalar(select(func.count()).select_from(WorkflowExecution).where(WorkflowExecution.workflow_id == w.id)) or 0
    last = db.scalar(select(WorkflowExecution).where(WorkflowExecution.workflow_id == w.id).order_by(WorkflowExecution.created_at.desc()).limit(1))
    return WorkflowOut(
        id=w.id, name=w.name, description=w.description, trigger_type=w.trigger_type, conditions=w.conditions,
        actions=w.actions, is_active=w.is_active, created_by_name=_name(db, w.created_by), created_at=w.created_at,
        updated_at=w.updated_at, run_count=count,
        last_run=ExecutionBrief(id=last.id, status=last.status, lead_name=last.lead_name, created_at=last.created_at) if last else None,
    )


def execution_out(db: Session, ex: WorkflowExecution) -> ExecutionOut:
    return ExecutionOut(
        id=ex.id, workflow_id=ex.workflow_id, workflow_name=ex.workflow_name, lead_id=ex.lead_id, lead_name=ex.lead_name,
        trigger_source=ex.trigger_source, status=ex.status, cursor=ex.cursor, total_steps=len(ex.definition.get("actions", [])),
        attempts=ex.attempts, definition=ex.definition, steps=ex.steps, context=ex.context, error_message=ex.error_message, trace_id=ex.trace_id,
        started_at=ex.started_at, finished_at=ex.finished_at, created_at=ex.created_at, created_by_name=_name(db, ex.created_by),
    )


def _get(db: Session, ctx: AuthContext, workflow_id: uuid.UUID) -> Workflow:
    w = db.scalar(select(Workflow).where(Workflow.id == workflow_id, Workflow.organization_id == ctx.organization_id))
    if w is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    return w


def _wrap(fn, *args, **kw):
    try:
        return fn(*args, **kw)
    except svc.WorkflowError as e:
        raise HTTPException(e.status_code, e.message) from None


# ---------------------------------------------------------------- runs (declared before /{id})
@router.get("/executions", response_model=ExecutionList)
def list_executions(
    status_filter: str | None = Query(None, alias="status"),
    workflow_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ExecutionList:
    q = select(WorkflowExecution).where(WorkflowExecution.organization_id == ctx.organization_id)
    if status_filter:
        q = q.where(WorkflowExecution.status == status_filter)
    if workflow_id:
        q = q.where(WorkflowExecution.workflow_id == workflow_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(WorkflowExecution.created_at.desc(), WorkflowExecution.id).offset((page - 1) * page_size).limit(page_size))
    return ExecutionList(items=[execution_out(db, e) for e in rows], total=total)


@router.get("/executions/{execution_id}", response_model=ExecutionOut)
def read_execution(execution_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> ExecutionOut:
    return execution_out(db, _wrap(svc.get_execution, db, ctx, execution_id))


@router.post("/executions/{execution_id}/run", response_model=ExecutionOut, dependencies=[Depends(rate_limit("wf_start", 10))])
def run_queued(
    execution_id: uuid.UUID,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
    llm: ChatLLM = Depends(get_chat_llm),
) -> ExecutionOut:
    """Starts a run that is waiting in the queue (for example one triggered by a lead the AI assistant created)."""
    return execution_out(db, _wrap(svc.run_execution, db, ctx, llm, execution_id))


@router.post("/executions/{execution_id}/retry", response_model=ExecutionOut, dependencies=[Depends(rate_limit("wf_retry", 10))])
def retry(
    execution_id: uuid.UUID,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
    llm: ChatLLM = Depends(get_chat_llm),
) -> ExecutionOut:
    """Re-runs a failed run from the step that failed (earlier steps are not repeated)."""
    return execution_out(db, _wrap(svc.run_execution, db, ctx, llm, execution_id, retry=True))


@router.post("/executions/{execution_id}/cancel", response_model=ExecutionOut)
def cancel(execution_id: uuid.UUID, ctx: AuthContext = Depends(require_role("manager")), db: Session = Depends(get_db)) -> ExecutionOut:
    return execution_out(db, _wrap(svc.cancel_execution, db, ctx, execution_id))


# ---------------------------------------------------------------- definitions
@router.get("", response_model=list[WorkflowOut])
def list_workflows(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[WorkflowOut]:
    rows = db.scalars(select(Workflow).where(Workflow.organization_id == ctx.organization_id).order_by(Workflow.created_at.desc(), Workflow.id))
    return [workflow_out(db, w) for w in rows]


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
def create(body: WorkflowCreate, ctx: AuthContext = Depends(require_role("admin")), db: Session = Depends(get_db)) -> WorkflowOut:
    w = Workflow(
        organization_id=ctx.organization_id, created_by=ctx.user.id, name=body.name, description=body.description,
        trigger_type=body.trigger_type, is_active=body.is_active,
        conditions=[c.model_dump() for c in body.conditions], actions=[a.model_dump(exclude_none=True) for a in body.actions],
    )
    db.add(w)
    db.flush()
    log_activity(db, ctx, entity_type="workflow", entity_id=w.id, action="workflow.created", details={"name": w.name})
    db.commit()
    db.refresh(w)
    return workflow_out(db, w)


@router.get("/{workflow_id}", response_model=WorkflowOut)
def read(workflow_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> WorkflowOut:
    return workflow_out(db, _get(db, ctx, workflow_id))


@router.patch("/{workflow_id}", response_model=WorkflowOut)
def update(workflow_id: uuid.UUID, body: WorkflowUpdate, ctx: AuthContext = Depends(require_role("admin")), db: Session = Depends(get_db)) -> WorkflowOut:
    w = _get(db, ctx, workflow_id)
    data = body.model_dump(exclude_unset=True, exclude_none=False)
    if not data:
        raise HTTPException(422, "Nothing to update")
    if "conditions" in data and body.conditions is not None:
        w.conditions = [c.model_dump() for c in body.conditions]
    if "actions" in data and body.actions is not None:
        w.actions = [a.model_dump(exclude_none=True) for a in body.actions]
    for f in ("name", "description", "trigger_type", "is_active"):
        if f in data and (data[f] is not None or f == "description"):
            setattr(w, f, data[f])
    log_activity(db, ctx, entity_type="workflow", entity_id=w.id, action="workflow.updated", details={"fields": sorted(data)})
    db.commit()
    db.refresh(w)
    return workflow_out(db, w)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(workflow_id: uuid.UUID, ctx: AuthContext = Depends(require_role("admin")), db: Session = Depends(get_db)) -> Response:
    w = _get(db, ctx, workflow_id)
    busy = db.scalar(
        select(func.count()).select_from(WorkflowExecution).where(
            WorkflowExecution.workflow_id == w.id, WorkflowExecution.status.in_(("queued", "running", "waiting_approval"))
        )
    )
    if busy:
        raise HTTPException(409, "This workflow has runs in progress. Cancel them first, or pause the workflow instead.")
    log_activity(db, ctx, entity_type="workflow", entity_id=w.id, action="workflow.deleted", details={"name": w.name})
    db.delete(w)  # run history is kept (its workflow_id becomes empty)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{workflow_id}/execute", response_model=ExecutionOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("wf_run", 10))])
def execute(
    workflow_id: uuid.UUID,
    body: ExecuteRequest,
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
    llm: ChatLLM = Depends(get_chat_llm),
) -> ExecutionOut:
    """Runs the workflow now on one lead and waits for it to finish (or to reach an approval)."""
    w = _get(db, ctx, workflow_id)
    if not w.is_active:
        raise HTTPException(409, "This workflow is paused. Resume it to run it.")
    lead = db.scalar(select(Lead).where(Lead.id == body.lead_id, Lead.organization_id == ctx.organization_id))
    if lead is None:
        raise HTTPException(404, "Lead not found")
    ex = svc.create_execution(db, ctx, w, lead, "manual")
    db.commit()
    try:
        out = svc.run_execution(db, ctx, llm, ex.id)
    except svc.WorkflowError as e:
        raise HTTPException(e.status_code, e.message) from None
    return execution_out(db, out)


@router.get("/{workflow_id}/executions", response_model=ExecutionList)
def workflow_executions(
    workflow_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ExecutionList:
    _get(db, ctx, workflow_id)
    return list_executions(None, workflow_id, page, page_size, ctx, db)