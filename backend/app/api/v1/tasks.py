"""Follow-up tasks. Anyone can keep their own; managers can see and assign for the whole team."""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import ROLE_RANK, AuthContext, get_auth_context, log_activity
from app.db.models import Lead, OrganizationMember, Profile, Task, utcnow
from app.db.session import get_db
from app.schemas.task import TaskCreate, TaskList, TaskOut, TaskSummary, TaskUpdate
from app.services.notify import notify
from app.services.task_reminders import aware, send_due_reminders

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _is_manager(ctx: AuthContext) -> bool:
    return ROLE_RANK[ctx.role] >= ROLE_RANK["manager"]


def _out(db: Session, t: Task) -> TaskOut:
    lead = db.get(Lead, t.lead_id) if t.lead_id else None
    who = db.get(Profile, t.assigned_to) if t.assigned_to else None
    due = aware(t.due_at)
    return TaskOut(
        id=t.id, title=t.title, notes=t.notes, status=t.status, due_at=due,
        overdue=bool(t.status == "open" and due and due < utcnow()),
        completed_at=aware(t.completed_at), lead_id=t.lead_id, lead_name=lead.name if lead else None,
        assigned_to=t.assigned_to, assigned_name=who.full_name if who else None, created_by=t.created_by,
        created_at=aware(t.created_at),
    )


def _get(db: Session, ctx: AuthContext, task_id: uuid.UUID) -> Task:
    t = db.scalar(select(Task).where(Task.id == task_id, Task.organization_id == ctx.organization_id))
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return t


def _check_member(db: Session, ctx: AuthContext, profile_id: uuid.UUID) -> None:
    ok = db.scalar(
        select(OrganizationMember.id).where(
            OrganizationMember.organization_id == ctx.organization_id, OrganizationMember.profile_id == profile_id
        )
    )
    if ok is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person is not in your organization")


def _can_edit(ctx: AuthContext, t: Task) -> bool:
    return _is_manager(ctx) or ctx.user.id in (t.created_by, t.assigned_to)


def _log(db: Session, ctx: AuthContext, t: Task, action: str) -> None:
    # Tasks on a lead appear in that lead's timeline.
    if t.lead_id:
        log_activity(db, ctx, entity_type="lead", entity_id=t.lead_id, action=action, details={"title": t.title})
    else:
        log_activity(db, ctx, entity_type="task", entity_id=t.id, action=action, details={"title": t.title})


@router.get("/summary", response_model=TaskSummary)
def summary(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> TaskSummary:
    """The signed-in person's counts. Opening the app calls this, which is also when due reminders are created."""
    if send_due_reminders(db, ctx.organization_id, ctx.user.id):
        db.commit()
    now = utcnow()
    mine = (Task.organization_id == ctx.organization_id, Task.assigned_to == ctx.user.id, Task.status == "open")

    def count(*extra) -> int:
        return db.scalar(select(func.count()).select_from(Task).where(*mine, *extra)) or 0

    return TaskSummary(
        open=count(), overdue=count(Task.due_at < now), due_soon=count(Task.due_at >= now, Task.due_at < now + timedelta(hours=24))
    )


@router.get("", response_model=TaskList)
def list_tasks(
    scope: str = Query("mine", pattern="^(mine|all)$"),
    state: str = Query("open", pattern="^(open|done|all)$"),
    lead_id: uuid.UUID | None = None,
    limit: int = Query(100, ge=1, le=200),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> TaskList:
    q = select(Task).where(Task.organization_id == ctx.organization_id)
    if lead_id is not None:
        # Anyone in the organization can open a lead, so they can see its tasks too.
        if db.scalar(select(Lead.id).where(Lead.id == lead_id, Lead.organization_id == ctx.organization_id)) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        q = q.where(Task.lead_id == lead_id)
    elif scope == "all":
        if not _is_manager(ctx):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only managers can see everyone's tasks")
    else:
        q = q.where(Task.assigned_to == ctx.user.id)
    if state != "all":
        q = q.where(Task.status == state)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    # Open tasks: soonest due first, undated last. Done tasks: most recently finished first.
    order = (Task.completed_at.desc(),) if state == "done" else (Task.due_at.is_(None), Task.due_at.asc(), Task.created_at.desc())
    rows = db.scalars(q.order_by(*order).limit(limit)).all()
    return TaskList(items=[_out(db, t) for t in rows], total=total)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> TaskOut:
    if body.lead_id and db.scalar(select(Lead.id).where(Lead.id == body.lead_id, Lead.organization_id == ctx.organization_id)) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    assignee = body.assigned_to or ctx.user.id
    if assignee != ctx.user.id:
        if not _is_manager(ctx):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only managers can assign tasks to other people")
        _check_member(db, ctx, assignee)
    t = Task(
        organization_id=ctx.organization_id, lead_id=body.lead_id, title=body.title, notes=body.notes or None,
        due_at=body.due_at, assigned_to=assignee, created_by=ctx.user.id,
    )
    db.add(t)
    db.flush()
    _log(db, ctx, t, "task.created")
    if assignee != ctx.user.id:
        notify(db, ctx.organization_id, [assignee], kind="task.assigned", title=f"New task: {t.title}",
               body=f"Assigned by {ctx.user.full_name}", link=f"/leads/{t.lead_id}" if t.lead_id else "/tasks",
               entity_type="task", entity_id=t.id)
    db.commit()
    return _out(db, t)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: uuid.UUID, body: TaskUpdate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> TaskOut:
    t = _get(db, ctx, task_id)
    if not _can_edit(ctx, t):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own tasks")
    sent = body.model_fields_set
    if "title" in sent and body.title:
        t.title = body.title
    if "notes" in sent:
        t.notes = body.notes or None
    if "due_at" in sent:
        t.due_at = body.due_at
        t.reminded_at = None  # a new due date earns a new reminder
    if "assigned_to" in sent and body.assigned_to and body.assigned_to != t.assigned_to:
        if not _is_manager(ctx) and body.assigned_to != ctx.user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only managers can assign tasks to other people")
        _check_member(db, ctx, body.assigned_to)
        t.assigned_to = body.assigned_to
        t.reminded_at = None
        if body.assigned_to != ctx.user.id:
            notify(db, ctx.organization_id, [body.assigned_to], kind="task.assigned", title=f"New task: {t.title}",
                   body=f"Assigned by {ctx.user.full_name}", link=f"/leads/{t.lead_id}" if t.lead_id else "/tasks",
                   entity_type="task", entity_id=t.id)
    if "status" in sent and body.status and body.status != t.status:
        t.status = body.status
        t.completed_at = utcnow() if body.status == "done" else None
        _log(db, ctx, t, "task.completed" if body.status == "done" else "task.reopened")
    db.commit()
    return _out(db, t)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> None:
    t = _get(db, ctx, task_id)
    if not _can_edit(ctx, t):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own tasks")
    db.delete(t)
    db.commit()