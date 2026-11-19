"""Observability: who ran what, how long it took, what failed. Managers and above only, except that
anyone can open the trace of their own run."""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, AuthContext, get_auth_context, require_role
from app.db.models import ActivityLog, AgentRun, Profile, ToolExecution, utcnow
from app.db.session import get_db
from app.schemas.agent import ToolExecutionOut
from app.schemas.observability import (
    ActivityItem,
    ActivityPage,
    ObservabilityStats,
    RunList,
    RunSummary,
    Trace,
    TraceStep,
)
from app.services.sweeper import sweep_stuck_runs

router = APIRouter(tags=["observability"])


def _summary(run: AgentRun, user_name: str | None) -> RunSummary:
    tokens = None if run.prompt_tokens is None and run.completion_tokens is None else (run.prompt_tokens or 0) + (run.completion_tokens or 0)
    return RunSummary(
        id=run.id, trace_id=run.trace_id, status=run.status, model=run.model, user_name=user_name, steps=run.steps,
        tool_call_count=run.tool_call_count, total_tokens=tokens, error_message=run.error_message,
        started_at=run.started_at, duration_ms=run.duration_ms,
    )


@router.get("/agent/runs", response_model=RunList)
def list_runs(
    run_status: str | None = Query(None, alias="status", pattern="^(running|completed|failed)$"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
) -> RunList:
    sweep_stuck_runs(db, ctx.organization_id)  # so interrupted runs show as failed, not "running" forever
    where = [AgentRun.organization_id == ctx.organization_id]
    if run_status:
        where.append(AgentRun.status == run_status)
    total = db.scalar(select(func.count()).select_from(AgentRun).where(*where)) or 0
    rows = db.execute(
        select(AgentRun, Profile.full_name)
        .join(Profile, Profile.id == AgentRun.user_id, isouter=True)
        .where(*where)
        .order_by(AgentRun.started_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return RunList(items=[_summary(r, name) for r, name in rows], total=total)


@router.get("/agent/runs/{run_id}/trace", response_model=Trace)
def run_trace(run_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> Trace:
    row = db.execute(
        select(AgentRun, Profile.full_name)
        .join(Profile, Profile.id == AgentRun.user_id, isouter=True)
        .where(AgentRun.id == run_id, AgentRun.organization_id == ctx.organization_id)
    ).first()
    if row is None or (row[0].user_id != ctx.user.id and ROLE_RANK[ctx.role] < ROLE_RANK["manager"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    run, name = row
    tools = db.scalars(select(ToolExecution).where(ToolExecution.run_id == run.id).order_by(ToolExecution.sequence)).all()
    timeline = []
    elapsed = 0
    for t in tools:  # tools run one after another, so the start of each is the sum of the ones before
        out = ToolExecutionOut.model_validate(t)
        timeline.append(TraceStep(**out.model_dump(), offset_ms=elapsed))
        elapsed += t.duration_ms
    return Trace(
        run=_summary(run, name), prompt_tokens=run.prompt_tokens, completion_tokens=run.completion_tokens,
        finished_at=run.finished_at, timeline=timeline,
    )


@router.get("/observability/stats", response_model=ObservabilityStats)
def stats(
    days: int = Query(7, ge=1, le=90), ctx: AuthContext = Depends(require_role("manager")), db: Session = Depends(get_db)
) -> ObservabilityStats:
    since = utcnow() - timedelta(days=days)
    runs = db.scalars(select(AgentRun).where(AgentRun.organization_id == ctx.organization_id, AgentRun.started_at >= since)).all()
    durations = sorted(r.duration_ms for r in runs if r.duration_ms is not None)
    p95 = durations[min(int(len(durations) * 0.95), len(durations) - 1)] if durations else None
    failed = sum(1 for r in runs if r.status == "failed")
    tool_rows = db.execute(
        select(ToolExecution.tool_name, ToolExecution.status, func.count(), func.avg(ToolExecution.duration_ms))
        .where(ToolExecution.organization_id == ctx.organization_id, ToolExecution.created_at >= since)
        .group_by(ToolExecution.tool_name, ToolExecution.status)
    ).all()
    per: dict[str, dict] = {}
    for name, st, count, avg in tool_rows:
        d = per.setdefault(name, {"tool": name, "calls": 0, "errors": 0, "blocked": 0, "_ms": 0.0})
        d["calls"] += count
        d["errors"] += count if st == "error" else 0
        d["blocked"] += count if st == "blocked" else 0
        d["_ms"] += float(avg or 0) * count
    by_tool = sorted(
        ({"tool": d["tool"], "calls": d["calls"], "errors": d["errors"], "blocked": d["blocked"], "avg_ms": int(d["_ms"] / d["calls"])} for d in per.values()),
        key=lambda d: -d["calls"],
    )
    return ObservabilityStats(
        days=days, runs=len(runs), failed=failed, failure_rate=round(failed / len(runs), 4) if runs else 0.0,
        avg_duration_ms=int(sum(durations) / len(durations)) if durations else None, p95_duration_ms=p95,
        total_tokens=sum((r.prompt_tokens or 0) + (r.completion_tokens or 0) for r in runs),
        tool_calls=sum(d["calls"] for d in by_tool), tool_errors=sum(d["errors"] for d in by_tool),
        blocked_tool_calls=sum(d["blocked"] for d in by_tool), by_tool=by_tool,
    )


@router.get("/activity", response_model=ActivityPage)
def activity(
    action: str | None = Query(None, max_length=60, description="Prefix filter, e.g. 'approval'"),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: AuthContext = Depends(require_role("manager")),
    db: Session = Depends(get_db),
) -> ActivityPage:
    where = [ActivityLog.organization_id == ctx.organization_id]
    if action:
        escaped = action.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append(ActivityLog.action.like(f"{escaped}%", escape="\\"))
    total = db.scalar(select(func.count()).select_from(ActivityLog).where(*where)) or 0
    rows = db.execute(
        select(ActivityLog, Profile.full_name)
        .join(Profile, Profile.id == ActivityLog.actor_id, isouter=True)
        .where(*where)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        ActivityItem(
            id=a.id, action=a.action, entity_type=a.entity_type, entity_id=a.entity_id, actor_name=name,
            created_at=a.created_at, details=a.details if isinstance(a.details, dict) else None,
        )
        for a, name in rows
    ]
    return ActivityPage(items=items, total=total)