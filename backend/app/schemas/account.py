import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.auth import Name, Password


class ProfileUpdate(BaseModel):
    full_name: Name


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: Password


class OrganizationUpdate(BaseModel):
    name: Name


class RoleUpdate(BaseModel):
    # "owner" can never be granted through the API.
    role: Literal["admin", "manager", "employee"]


class MemberRef(BaseModel):
    id: uuid.UUID