from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Language = Literal["en", "hi"]


class BriefingSummaryRequest(BaseModel):
    language: Language = "en"


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=1500)]


class LeadAsk(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    history: list[Turn] = Field(default_factory=list, max_length=6)  # recent turns, so follow-up questions make sense
    language: Language = "en"


class LeadAnswer(BaseModel):
    answer: str
    model: str