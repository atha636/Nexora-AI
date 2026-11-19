import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.agent import ToolExecutionOut


class RunSummary(BaseModel):
    id: uuid.UUID
    trace_id: str
    status: str
    model: str
    user_name: str | None
    steps: int
    tool_call_count: int
    total_tokens: int | None
    error_message: str | None
    started_at: datetime
    duration_ms: int | None


class RunList(BaseModel):
    items: list[RunSummary]
    total: int


class TraceStep(ToolExecutionOut):
    offset_ms: int  # when the tool started, relative to the start of the run


class Trace(BaseModel):
    run: RunSummary
    prompt_tokens: int | None
    completion_tokens: int | None
    finished_at: datetime | None
    timeline: list[TraceStep]


class ObservabilityStats(BaseModel):
    days: int
    runs: int
    failed: int
    failure_rate: float
    avg_duration_ms: int | None
    p95_duration_ms: int | None
    total_tokens: int
    tool_calls: int
    tool_errors: int
    blocked_tool_calls: int
    by_tool: list[dict]


class ActivityItem(BaseModel):
    id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    actor_name: str | None
    created_at: datetime
    details: dict | None


class ActivityPage(BaseModel):
    items: list[ActivityItem]
    total: int