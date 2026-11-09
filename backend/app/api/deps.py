import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.models import ActivityLog, OrganizationMember, Profile
from app.db.session import get_db

bearer_scheme = HTTPBearer(auto_error=False)

ROLE_RANK = {"employee": 0, "manager": 1, "admin": 2, "owner": 3}


@dataclass
class AuthContext:
    """Who is calling and which organization they act in.

    The organization always comes from the database membership row, never from
    anything the browser sends. That is what keeps tenants isolated.
    """

    user: Profile
    organization_id: uuid.UUID
    role: str


def _unauthorized() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_auth_context(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthContext:
    if creds is None:
        raise _unauthorized()
    sub = decode_access_token(creds.credentials)
    if sub is None:
        raise _unauthorized()
    try:
        user_id = uuid.UUID(sub)
    except ValueError:
        raise _unauthorized()

    user = db.get(Profile, user_id)
    if user is None:
        raise _unauthorized()

    membership = db.scalar(
        select(OrganizationMember)
        .where(OrganizationMember.profile_id == user.id)
        .order_by(OrganizationMember.created_at)
    )
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No organization membership")
    return AuthContext(user=user, organization_id=membership.organization_id, role=membership.role)


def require_role(minimum: str):
    """Dependency factory: `Depends(require_role("manager"))` allows manager, admin, owner."""

    def checker(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if ROLE_RANK[ctx.role] < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission to do that")
        return ctx

    return checker


def log_activity(
    db: Session,
    ctx: AuthContext,
    *,
    entity_type: str,
    action: str,
    entity_id: uuid.UUID | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        ActivityLog(
            organization_id=ctx.organization_id,
            actor_id=ctx.user.id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            details=details,
        )
    )