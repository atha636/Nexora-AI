from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity, require_role
from app.core.security import hash_password
from app.db.models import Lead, OrganizationMember, Profile
from app.db.session import get_db
from app.schemas.account import RoleUpdate
from app.schemas.auth import TeamMemberCreate, TeamMemberOut
import uuid

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


def _target(db: Session, ctx: AuthContext, profile_id: uuid.UUID) -> OrganizationMember:
    """The membership being changed. Other organizations' people look like they don't exist (404).

    Rules: nobody edits themselves or the owner, and only the owner may change an admin.
    """
    m = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == ctx.organization_id,
            OrganizationMember.profile_id == profile_id,
        )
    )
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team member not found")
    if m.profile_id == ctx.user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't change your own access")
    if m.role == "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The owner's access can't be changed")
    if m.role == "admin" and ctx.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can change an admin")
    return m


@router.patch("/{profile_id}", response_model=TeamMemberOut)
def change_role(
    profile_id: uuid.UUID,
    body: RoleUpdate,
    ctx: AuthContext = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> TeamMemberOut:
    m = _target(db, ctx, profile_id)
    if body.role == "admin" and ctx.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can make someone an admin")
    before = m.role
    m.role = body.role
    log_activity(
        db, ctx, entity_type="member", entity_id=profile_id, action="member.role_changed",
        details={"from": before, "to": body.role},
    )
    db.commit()
    user = db.get(Profile, profile_id)
    return TeamMemberOut(id=user.id, email=user.email, full_name=user.full_name, role=m.role)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    profile_id: uuid.UUID,
    ctx: AuthContext = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> None:
    """Takes the person out of the organization. Their leads become unassigned; history is kept."""
    m = _target(db, ctx, profile_id)
    db.execute(
        update(Lead)
        .where(Lead.organization_id == ctx.organization_id, Lead.assigned_to == profile_id)
        .values(assigned_to=None)
    )
    db.delete(m)
    log_activity(db, ctx, entity_type="member", entity_id=profile_id, action="member.removed")
    db.commit()