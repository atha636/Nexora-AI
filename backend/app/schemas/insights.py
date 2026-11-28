import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints


class AskAnalyticsRequest(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    language: Literal["en", "hi"] = "en"


class AnalysisResponse(BaseModel):
    answer: str
    results: list[dict]
    run_id: uuid.UUID
    trace_id: str
    duration_ms: int | None
    tools: list[dict]