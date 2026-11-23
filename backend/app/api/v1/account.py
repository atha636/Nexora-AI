"""Settings: your own profile and password, and the organization's name."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.core.security import hash_password, verify_password
from app.db.models import Organization
from app.db.session import get_db
from app.schemas.account import OrganizationUpdate, PasswordChange, ProfileUpdate
from app.schemas.auth import MeResponse, OrganizationOut

router = APIRouter(prefix="/account", tags=["account"])


def _me(ctx: AuthContext, org: Organization) -> MeResponse:
    return MeResponse(
        id=ctx.user.id,
        email=ctx.user.email,
        full_name=ctx.user.full_name,
        role=ctx.role,
        organization=OrganizationOut(id=org.id, name=org.name),
    )


@router.patch("/profile", response_model=MeResponse)
def update_profile(
    body: ProfileUpdate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> MeResponse:
    ctx.user.full_name = body.full_name
    log_activity(db, ctx, entity_type="member", entity_id=ctx.user.id, action="profile.updated")
    db.commit()
    return _me(ctx, db.get(Organization, ctx.organization_id))


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChange, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> None:
    if not verify_password(body.current_password, ctx.user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    ctx.user.password_hash = hash_password(body.new_password)
    log_activity(db, ctx, entity_type="member", entity_id=ctx.user.id, action="password.changed")
    db.commit()


@router.patch("/organization", response_model=MeResponse)
def rename_organization(
    body: OrganizationUpdate, ctx: AuthContext = Depends(require_role("admin")), db: Session = Depends(get_db)
) -> MeResponse:
    org = db.get(Organization, ctx.organization_id)
    org.name = body.name
    log_activity(db, ctx, entity_type="organization", entity_id=org.id, action="organization.renamed")
    db.commit()
    return _me(ctx, org)