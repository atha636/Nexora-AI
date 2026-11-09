import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Password = Annotated[str, Field(min_length=8, max_length=72)]  # bcrypt ignores bytes past 72


class _EmailMixin(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class SignupRequest(_EmailMixin):
    password: Password
    full_name: Name
    organization_name: Name


class LoginRequest(_EmailMixin):
    password: str = Field(min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    organization: OrganizationOut


class TeamMemberCreate(_EmailMixin):
    full_name: Name
    password: Password
    # "owner" can't be granted through the API.
    role: Literal["admin", "manager", "employee"] = "employee"


class TeamMemberOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str