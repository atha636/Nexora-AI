from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.core.security import hash_password
from app.db.models import OrganizationMember, Profile
from app.db.session import get_db
from app.schemas.auth import TeamMemberCreate, TeamMemberOut

router = APIRouter(prefix="/team", tags=["team"])


@router.get("", response_model=list[TeamMemberOut])
def list_team(
    ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> list[TeamMemberOut]:
    rows = db.execute(
        select(Profile, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.profile_id == Profile.id)
        .where(OrganizationMember.organization_id == ctx.organization_id)
        .order_by(Profile.full_name)
    ).all()
    return [
        TeamMemberOut(id=p.id, email=p.email, full_name=p.full_name, role=role) for p, role in rows
    ]


@router.post("", response_model=TeamMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    body: TeamMemberCreate,
    ctx: AuthContext = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> TeamMemberOut:
    """Admins and owners add teammates with a temporary password (email invites come later)."""
    if db.scalar(select(Profile).where(Profile.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = Profile(
        email=body.email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    db.add(OrganizationMember(organization_id=ctx.organization_id, profile_id=user.id, role=body.role))
    log_activity(
        db,
        ctx,
        entity_type="member",
        entity_id=user.id,
        action="member.added",
        details={"role": body.role},
    )
    db.commit()
    return TeamMemberOut(id=user.id, email=user.email, full_name=user.full_name, role=body.role)