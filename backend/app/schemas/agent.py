import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    conversation_id: uuid.UUID | None = None  # omit to start a new conversation
    language: Literal["en", "hi"] = "en"  # the language the assistant replies in


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    blocks: list | None
    run_id: uuid.UUID | None
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class UsageOut(BaseModel):
    steps: int
    tool_calls: int
    prompt_tokens: int | None
    completion_tokens: int | None
    duration_ms: int | None


class ChatResponse(BaseModel):
    conversation: ConversationOut
    user_message: MessageOut
    assistant_message: MessageOut
    run_id: uuid.UUID
    trace_id: str
    usage: UsageOut


class ToolExecutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sequence: int
    tool_name: str
    status: str
    arguments: dict | str | None
    summary: str | None
    error_message: str | None
    duration_ms: int
    created_at: datetime


class RunOut(BaseModel):
    id: uuid.UUID
    trace_id: str
    status: str
    model: str
    steps: int
    tool_call_count: int
    prompt_tokens: int | None
    completion_tokens: int | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    tools: list[ToolExecutionOut]