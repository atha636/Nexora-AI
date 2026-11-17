import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Tone = Literal["friendly", "professional", "formal", "casual", "urgent"]
Purpose = Literal["follow_up", "introduction", "meeting_request", "proposal_follow_up", "thank_you", "re_engage"]


class DraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lead_id: uuid.UUID
    tone: Tone = "friendly"
    purpose: Purpose = "follow_up"
    instructions: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None

    @model_validator(mode="after")
    def _blank(self):
        if self.instructions == "":
            self.instructions = None
        return self


class DraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)] | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.subject is None and self.body is None:
            raise ValueError("Nothing to change")
        if self.subject is not None and ("\n" in self.subject or "\r" in self.subject):
            raise ValueError("The subject must be a single line")
        return self


class DraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lead_id: uuid.UUID | None
    lead_name: str | None = None
    to_email: str | None
    subject: str
    body: str
    tone: str
    purpose: str
    status: str
    ai_generated: bool
    approval_id: uuid.UUID | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DraftList(BaseModel):
    items: list[DraftOut]
    total: int


class EmailMeta(BaseModel):
    tones: list[str]
    purposes: list[str]
    provider: str
    simulated: bool  # True = sending is a mock; no real email leaves the system


class DecisionNote(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = Field(None)


class ApprovalOut(BaseModel):
    id: uuid.UUID
    action_type: str
    entity_type: str
    entity_id: uuid.UUID | None
    title: str
    payload: dict
    status: str
    requested_by_name: str | None
    requested_via: str
    decided_by_name: str | None
    decided_at: datetime | None
    decision_note: str | None
    executed_at: datetime | None
    result: dict | None
    error_message: str | None
    created_at: datetime
    can_decide: bool  # whether the CURRENT user may approve/reject it
    can_cancel: bool


class ApprovalList(BaseModel):
    items: list[ApprovalOut]
    total: int
    pending: int  # pending requests visible to this user