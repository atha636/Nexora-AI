import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class TaskCreate(BaseModel):
    title: Title
    notes: Notes | None = None
    due_at: datetime | None = None
    lead_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None  # defaults to the person creating it


class TaskUpdate(BaseModel):
    """Only the fields that are sent change. Sending `due_at: null` clears the due date."""

    title: Title | None = None
    notes: Notes | None = None
    due_at: datetime | None = None
    assigned_to: uuid.UUID | None = None
    status: Literal["open", "done"] | None = None


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    notes: str | None
    status: str
    due_at: datetime | None
    overdue: bool
    completed_at: datetime | None
    lead_id: uuid.UUID | None
    lead_name: str | None
    assigned_to: uuid.UUID | None
    assigned_name: str | None
    created_by: uuid.UUID | None
    created_at: datetime


class TaskList(BaseModel):
    items: list[TaskOut]
    total: int


class TaskSummary(BaseModel):
    open: int
    overdue: int
    due_soon: int  # open and due within the next 24 hours