"""add conversations, agent_runs, messages, tool_executions (AI agent)

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _fk(column: str, target: str, ondelete: str) -> sa.ForeignKey:
    return sa.ForeignKey(f"{target}.id", ondelete=ondelete)


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), _fk("organization_id", "organizations", "CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), _fk("user_id", "profiles", "CASCADE"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_conversations_user_updated", "conversations", ["organization_id", "user_id", "updated_at"])

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), _fk("organization_id", "organizations", "CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), _fk("user_id", "profiles", "SET NULL"), nullable=True),
        sa.Column("conversation_id", sa.Uuid(), _fk("conversation_id", "conversations", "SET NULL"), nullable=True),
        sa.Column("trace_id", sa.String(32), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=False),
        sa.Column("tool_call_count", sa.Integer(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.CheckConstraint("status IN ('running', 'completed', 'failed')", name="ck_agent_run_status"),
    )
    op.create_index("ix_agent_runs_org_started", "agent_runs", ["organization_id", "started_at"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("conversation_id", sa.Uuid(), _fk("conversation_id", "conversations", "CASCADE"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), _fk("organization_id", "organizations", "CASCADE"), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("blocks", sa.JSON(), nullable=True),
        sa.Column("run_id", sa.Uuid(), _fk("run_id", "agent_runs", "SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_message_role"),
    )
    op.create_index("ix_messages_conversation_created", "messages", ["conversation_id", "created_at"])

    op.create_table(
        "tool_executions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), _fk("run_id", "agent_runs", "CASCADE"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), _fk("organization_id", "organizations", "CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("tool_name", sa.String(60), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("arguments", sa.JSON(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('ok', 'error', 'blocked')", name="ck_tool_execution_status"),
    )
    op.create_index("ix_tool_executions_run", "tool_executions", ["run_id", "sequence"])


def downgrade() -> None:
    op.drop_table("tool_executions")
    op.drop_table("messages")
    op.drop_table("agent_runs")
    op.drop_table("conversations")