import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.lead import LeadPriority, LeadStatus

ViewName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ViewFilters(BaseModel):
    """Only these keys can be saved; anything else is rejected, so a view can never smuggle in a query."""

    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(None, max_length=100)
    city: str | None = Field(None, max_length=80)
    priority: LeadPriority | None = None
    status: LeadStatus | None = None
    stale_days: int | None = Field(None, ge=1, le=365)
    assigned: Literal["me", "none"] | None = None
    created_days: int | None = Field(None, ge=1, le=365)
    sort: Literal["name", "city", "status", "priority", "created_at", "last_contacted_at"] | None = None
    order: Literal["asc", "desc"] | None = None


class ViewCreate(BaseModel):
    name: ViewName
    filters: ViewFilters
    shared: bool = False


class ViewUpdate(BaseModel):
    name: ViewName | None = None
    filters: ViewFilters | None = None
    shared: bool | None = None


class ViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    filters: dict
    shared: bool
    mine: bool
    created_at: datetime