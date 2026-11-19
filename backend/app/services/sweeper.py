"""Cleans up runs that were interrupted (for example the server restarted or a free-tier instance went to
sleep while a run was in progress). Without this they would show "running" forever."""

import logging
import uuid
from datetime import timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import AgentRun, WorkflowExecution, utcnow

log = logging.getLogger(__name__)
INTERRUPTED = "The run was interrupted before it finished (server restart or timeout). You can retry it."


def sweep_stuck_runs(db: Session, organization_id: uuid.UUID | None = None) -> int:
    """Marks overdue "running" runs as failed. Workflow runs can then be retried from the failed step."""
    cutoff = utcnow() - timedelta(minutes=get_settings().stuck_run_minutes)
    total = 0
    q = update(WorkflowExecution).where(WorkflowExecution.status == "running", WorkflowExecution.started_at < cutoff)
    if organization_id:
        q = q.where(WorkflowExecution.organization_id == organization_id)
    total += db.execute(q.values(status="failed", error_message=INTERRUPTED, finished_at=utcnow())).rowcount or 0
    q = update(AgentRun).where(AgentRun.status == "running", AgentRun.started_at < cutoff)
    if organization_id:
        q = q.where(AgentRun.organization_id == organization_id)
    total += db.execute(q.values(status="failed", error_message=INTERRUPTED, finished_at=utcnow())).rowcount or 0
    if total:
        log.warning("Marked %d interrupted run(s) as failed", total)
    db.commit()
    return total