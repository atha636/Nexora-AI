import logging
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity
from app.core.config import get_settings
from app.db.tenancy import bind_tenant
from app.core.ratelimit import rate_limit
from app.core.security import (
    create_access_token,
    create_reset_token,
    decode_reset_token,
    hash_password,
    reset_token_matches,
    verify_password,
)
from app.db.models import ActivityLog, Organization, OrganizationMember, Profile
from app.db.session import get_db
from app.services.email_provider import EmailSendError, get_email_provider
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    LoginRequest,
    MeResponse,
    OrganizationOut,
    SignupRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger(__name__)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("signup", 5))])
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
    bind_tenant(db, org.id)  # Row Level Security: this transaction belongs to the new organization
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


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit("login", 10))])
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


GENERIC_RESET_MESSAGE = "If an account exists for that email, a password reset link has been sent."


@router.post("/forgot-password", response_model=ForgotPasswordResponse, dependencies=[Depends(rate_limit("forgot", 5))])
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)) -> ForgotPasswordResponse:
    """Always answers the same way, so it can't be used to find out which emails have accounts."""
    settings = get_settings()
    user = db.scalar(select(Profile).where(Profile.email == body.email))
    link = None
    if user:
        token = create_reset_token(str(user.id), user.password_hash)
        link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(token)}"
        provider = get_email_provider()
        try:
            provider.send(
                to=user.email,
                subject="Reset your Nexora AI password",
                body=f"Hi {user.full_name},\n\nUse this link to choose a new password. It expires in "
                f"{settings.password_reset_minutes} minutes and works once:\n\n{link}\n\n"
                "If you did not ask for this, you can ignore this email.",
                from_name="Nexora AI",
            )
        except EmailSendError:
            log.error("Could not send a password reset email")
        if not (settings.environment == "development" and provider.simulated):
            link = None
    return ForgotPasswordResponse(detail=GENERIC_RESET_MESSAGE, dev_reset_link=link)


@router.post("/reset-password", dependencies=[Depends(rate_limit("reset", 5))])
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict:
    decoded = decode_reset_token(body.token)
    user = None
    if decoded:
        try:
            user = db.get(Profile, uuid.UUID(decoded[0]))
        except ValueError:
            user = None
    if decoded is None or user is None or not reset_token_matches(user.password_hash, decoded[1]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(body.new_password)
    membership = db.scalar(select(OrganizationMember).where(OrganizationMember.profile_id == user.id))
    if membership:
        bind_tenant(db, membership.organization_id)
        db.add(
            ActivityLog(
                organization_id=membership.organization_id, actor_id=user.id, entity_type="auth", entity_id=user.id,
                action="auth.password_reset",
            )
        )
    db.commit()
    return {"detail": "Your password has been changed. You can sign in now."}