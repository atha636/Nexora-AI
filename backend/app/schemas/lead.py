import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

LeadStatus = Literal["new", "contacted", "qualified", "won", "lost"]
LeadPriority = Literal["low", "medium", "high"]

Text = Annotated[str, StringConstraints(strip_whitespace=True)]

_OPTIONAL_TEXT_FIELDS = ("email", "phone", "company", "city", "source")


class _LeadFields(BaseModel):
    @field_validator(*_OPTIONAL_TEXT_FIELDS, mode="before", check_fields=False)
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class LeadCreate(_LeadFields):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: EmailStr | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None
    company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    source: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    status: LeadStatus = "new"
    priority: LeadPriority = "medium"
    assigned_to: uuid.UUID | None = None
    last_contacted_at: datetime | None = None


class LeadUpdate(_LeadFields):
    """Every field optional: only the fields the client sends are changed."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None
    email: EmailStr | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None
    company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    source: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    status: LeadStatus | None = None
    priority: LeadPriority | None = None
    assigned_to: uuid.UUID | None = None
    last_contacted_at: datetime | None = None

    @field_validator("name", "status", "priority", mode="after")
    @classmethod
    def _not_null(cls, v):
        # `None` is only valid for optional columns; these three are required in the DB.
        if v is None:
            raise ValueError("This field cannot be empty")
        return v


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    company: str | None
    city: str | None
    source: str | None
    status: str
    priority: str
    assigned_to: uuid.UUID | None
    last_contacted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LeadList(BaseModel):
    items: list[LeadOut]
    total: int
    page: int
    page_size: int


class BulkDelete(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class BulkUpdate(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    status: LeadStatus | None = None
    priority: LeadPriority | None = None
    assigned_to: uuid.UUID | None = None


class ActivityOut(BaseModel):
    id: uuid.UUID
    action: str
    details: dict | None
    actor_name: str | None
    created_at: datetime