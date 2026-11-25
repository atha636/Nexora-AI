"""add tasks (follow-up reminders)

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_to", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('open', 'done')", name="ck_task_status"),
    )
    op.create_index("ix_tasks_org_status_due", "tasks", ["organization_id", "status", "due_at"])
    op.create_index("ix_tasks_assignee", "tasks", ["assigned_to", "status"])
    op.create_index("ix_tasks_lead", "tasks", ["lead_id"])
    if op.get_bind().dialect.name == "postgresql":  # same tenant wall as every other table (see 0007)
        op.execute("ALTER TABLE tasks ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE tasks FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON tasks USING (organization_id = {CURRENT_ORG}) "
            f"WITH CHECK (organization_id = {CURRENT_ORG})"
        )


def downgrade() -> None:
    op.drop_table("tasks")