"""add email_drafts and approval_requests

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

DRAFT = ("draft", "pending_approval", "sent", "failed", "discarded")
APPROVAL = ("pending", "approved", "rejected", "executed", "failed", "cancelled")


def _in(col, vals):
    return f"{col} IN ({', '.join(repr(v) for v in vals)})"


def upgrade() -> None:
    op.create_table(
        "email_drafts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_email", sa.String(254), nullable=True),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("tone", sa.String(20), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("ai_generated", sa.Boolean(), nullable=False),
        sa.Column("model", sa.String(80), nullable=True),
        sa.Column("approval_id", sa.Uuid(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(_in("status", DRAFT), name="ck_email_draft_status"),
    )
    op.create_index("ix_email_drafts_org_created", "email_drafts", ["organization_id", "created_at"])
    op.create_index("ix_email_drafts_lead", "email_drafts", ["lead_id"])

    op.create_table(
        "approval_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_type", sa.String(40), nullable=False),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requested_via", sa.String(20), nullable=False),
        sa.Column("decided_by", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.String(500), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(_in("status", APPROVAL), name="ck_approval_status"),
    )
    op.create_index("ix_approvals_org_status", "approval_requests", ["organization_id", "status", "created_at"])


def downgrade() -> None:
    op.drop_table("approval_requests")
    op.drop_table("email_drafts")