"""Saved lead views. Everyone has personal ones; managers can share one with the whole team."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, AuthContext, get_auth_context
from app.db.models import SavedView
from app.db.session import get_db
from app.schemas.saved_view import ViewCreate, ViewOut, ViewUpdate

router = APIRouter(prefix="/views", tags=["views"])

MAX_PERSONAL_VIEWS = 20


def _is_manager(ctx: AuthContext) -> bool:
    return ROLE_RANK[ctx.role] >= ROLE_RANK["manager"]


def _out(v: SavedView, ctx: AuthContext) -> ViewOut:
    return ViewOut(id=v.id, name=v.name, filters=v.filters, shared=v.shared, mine=v.owner_id == ctx.user.id, created_at=v.created_at)


def _get(db: Session, ctx: AuthContext, view_id: uuid.UUID) -> SavedView:
    v = db.scalar(select(SavedView).where(SavedView.id == view_id, SavedView.organization_id == ctx.organization_id))
    # A teammate's private view looks exactly like a missing one.
    if v is None or (not v.shared and v.owner_id != ctx.user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "View not found")
    return v


def _can_change(ctx: AuthContext, v: SavedView) -> bool:
    return v.owner_id == ctx.user.id or (v.shared and _is_manager(ctx))


@router.get("", response_model=list[ViewOut])
def list_views(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[ViewOut]:
    rows = db.scalars(
        select(SavedView)
        .where(
            SavedView.organization_id == ctx.organization_id,
            or_(SavedView.owner_id == ctx.user.id, SavedView.shared.is_(True)),
        )
        .order_by(SavedView.shared.desc(), SavedView.created_at)
    ).all()
    return [_out(v, ctx) for v in rows]


@router.post("", response_model=ViewOut, status_code=status.HTTP_201_CREATED)
def create_view(body: ViewCreate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> ViewOut:
    if body.shared and not _is_manager(ctx):
        raise HTTPException(403, "Only managers can share a view with the team")
    count = db.scalar(
        select(func.count()).select_from(SavedView).where(
            SavedView.organization_id == ctx.organization_id, SavedView.owner_id == ctx.user.id
        )
    )
    if (count or 0) >= MAX_PERSONAL_VIEWS:
        raise HTTPException(422, f"You can keep up to {MAX_PERSONAL_VIEWS} saved views. Delete one first.")
    v = SavedView(
        organization_id=ctx.organization_id,
        owner_id=ctx.user.id,
        name=body.name,
        filters=body.filters.model_dump(exclude_none=True),
        shared=body.shared,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return _out(v, ctx)


@router.patch("/{view_id}", response_model=ViewOut)
def update_view(view_id: uuid.UUID, body: ViewUpdate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> ViewOut:
    v = _get(db, ctx, view_id)
    if not _can_change(ctx, v):
        raise HTTPException(403, "You can't change this view")
    if body.shared is not None and body.shared != v.shared:
        if not _is_manager(ctx):
            raise HTTPException(403, "Only managers can share a view with the team")
        v.shared = body.shared
    if body.name is not None:
        v.name = body.name
    if body.filters is not None:
        v.filters = body.filters.model_dump(exclude_none=True)
    db.commit()
    db.refresh(v)
    return _out(v, ctx)


@router.delete("/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_view(view_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> None:
    v = _get(db, ctx, view_id)
    if not _can_change(ctx, v):
        raise HTTPException(403, "You can't delete this view")
    db.delete(v)
    db.commit()