import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Tone = Literal["friendly", "professional", "formal", "casual", "urgent"]
Purpose = Literal["follow_up", "introduction", "meeting_request", "proposal_follow_up", "thank_you", "re_engage"]
PRIORITIES = {"low", "medium", "high"}
STATUSES = {"new", "contacted", "qualified", "won", "lost"}
MAX_ACTIONS = 6
MAX_CONDITIONS = 6


class Condition(BaseModel):
    """One check on the lead. All conditions must hold (AND)."""

    model_config = ConfigDict(extra="forbid")

    field: Literal["priority", "status", "city", "source", "days_since_contact", "has_email"]
    op: Literal["eq", "neq", "gte", "lte"]
    value: str | int | bool

    @model_validator(mode="after")
    def _check(self):
        f, op, v = self.field, self.op, self.value
        if f in ("priority", "status"):
            allowed = PRIORITIES if f == "priority" else STATUSES
            if op not in ("eq", "neq") or not isinstance(v, str) or v not in allowed:
                raise ValueError(f"{f} must be eq/neq one of: {', '.join(sorted(allowed))}")
        elif f in ("city", "source"):
            if op not in ("eq", "neq") or not isinstance(v, str) or not 1 <= len(v.strip()) <= 80:
                raise ValueError(f"{f} must be eq/neq a text value")
            self.value = v.strip()
        elif f == "days_since_contact":
            if op not in ("gte", "lte") or isinstance(v, (bool, str)) or not 0 <= v <= 3650:
                raise ValueError("days_since_contact must be gte/lte a number of days (0-3650)")
        else:  # has_email
            if op != "eq" or not isinstance(v, bool):
                raise ValueError("has_email must be eq true or false")
        return self


class DraftEmailAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["draft_email"]
    tone: Tone = "friendly"
    purpose: Purpose = "follow_up"
    instructions: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class RequestApprovalAction(BaseModel):
    """Asks a person to approve sending the draft made earlier in the same run. Never sends by itself."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["request_approval"]


class UpdateLeadAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["update_lead"]
    status: Literal["new", "contacted", "qualified", "won", "lost"] | None = None
    priority: Literal["low", "medium", "high"] | None = None

    @model_validator(mode="after")
    def _something(self):
        if self.status is None and self.priority is None:
            raise ValueError("update_lead needs a status or a priority")
        return self


Action = Annotated[Union[DraftEmailAction, RequestApprovalAction, UpdateLeadAction], Field(discriminator="type")]


def _check_actions(actions: list) -> None:
    drafted = False
    for i, a in enumerate(actions):
        if a.type == "draft_email":
            drafted = True
        elif a.type == "request_approval":
            if not drafted:
                raise ValueError("request_approval must come after a draft_email step")
            if i != len(actions) - 1:
                raise ValueError("request_approval must be the last step: the run then waits for a person's decision")


class WorkflowBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    trigger_type: Literal["manual", "lead_created"] = "manual"
    conditions: list[Condition] = Field(default_factory=list, max_length=MAX_CONDITIONS)
    actions: list[Action] = Field(min_length=1, max_length=MAX_ACTIONS)
    is_active: bool = True

    @model_validator(mode="after")
    def _order(self):
        _check_actions(self.actions)
        if self.description == "":
            self.description = None
        return self


class WorkflowCreate(WorkflowBase):
    pass


class WorkflowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    trigger_type: Literal["manual", "lead_created"] | None = None
    conditions: list[Condition] | None = Field(None, max_length=MAX_CONDITIONS)
    actions: list[Action] | None = Field(None, min_length=1, max_length=MAX_ACTIONS)
    is_active: bool | None = None

    @model_validator(mode="after")
    def _order(self):
        if self.actions:
            _check_actions(self.actions)
        return self


class ExecutionBrief(BaseModel):
    id: uuid.UUID
    status: str
    lead_name: str | None
    created_at: datetime


class WorkflowOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    trigger_type: str
    conditions: list[dict]
    actions: list[dict]
    is_active: bool
    created_by_name: str | None
    created_at: datetime
    updated_at: datetime
    run_count: int
    last_run: ExecutionBrief | None


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lead_id: uuid.UUID


class ExecutionOut(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID | None
    workflow_name: str
    lead_id: uuid.UUID | None
    lead_name: str | None
    trigger_source: str
    status: str
    cursor: int
    total_steps: int
    attempts: int
    definition: dict  # the snapshot this run uses: {conditions, actions}
    steps: list[dict]
    context: dict
    error_message: str | None
    trace_id: str
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    created_by_name: str | None


class ExecutionList(BaseModel):
    items: list[ExecutionOut]
    total: int