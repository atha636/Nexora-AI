from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import ActivityLog, Organization, OrganizationMember, Profile
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    OrganizationOut,
    SignupRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if db.scalar(select(Profile).where(Profile.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    org = Organization(name=body.organization_name)
    user = Profile(
        email=body.email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
    )
    db.add_all([org, user])
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, profile_id=user.id, role="owner"))
    db.add(
        ActivityLog(
            organization_id=org.id,
            actor_id=user.id,
            entity_type="organization",
            entity_id=org.id,
            action="organization.created",
        )
    )
    db.commit()
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(Profile).where(Profile.email == body.email))
    # Same message for "no such user" and "wrong password" on purpose.
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/logout")
def logout(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> dict:
    # Tokens are stateless, so the browser discards its copy; we just record the event.
    log_activity(db, ctx, entity_type="auth", action="auth.logout")
    db.commit()
    return {"detail": "Logged out"}


@router.get("/me", response_model=MeResponse)
def me(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> MeResponse:
    org = db.get(Organization, ctx.organization_id)
    return MeResponse(
        id=ctx.user.id,
        email=ctx.user.email,
        full_name=ctx.user.full_name,
        role=ctx.role,
        organization=OrganizationOut(id=org.id, name=org.name),
    )