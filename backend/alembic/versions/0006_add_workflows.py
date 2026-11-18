"""add workflows and workflow_executions

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

TRIGGERS = ("manual", "lead_created")
STATUSES = ("queued", "running", "waiting_approval", "completed", "failed", "cancelled", "skipped")


def _in(col, vals):
    return f"{col} IN ({', '.join(repr(v) for v in vals)})"


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("trigger_type", sa.String(20), nullable=False),
        sa.Column("conditions", sa.JSON(), nullable=False),
        sa.Column("actions", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(_in("trigger_type", TRIGGERS), name="ck_workflow_trigger"),
    )
    op.create_index("ix_workflows_org", "workflows", ["organization_id", "created_at"])

    op.create_table(
        "workflow_executions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_name", sa.String(120), nullable=False),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lead_name", sa.String(200), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trigger_source", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("cursor", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("trace_id", sa.String(32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(_in("status", STATUSES), name="ck_execution_status"),
    )
    op.create_index("ix_executions_org_created", "workflow_executions", ["organization_id", "created_at"])
    op.create_index("ix_executions_workflow", "workflow_executions", ["workflow_id", "created_at"])


def downgrade() -> None:
    op.drop_table("workflow_executions")
    op.drop_table("workflows")