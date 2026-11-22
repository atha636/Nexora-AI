"""add notifications

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.String(300), nullable=True),
        sa.Column("link", sa.String(200), nullable=True),
        sa.Column("entity_type", sa.String(30), nullable=True),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notifications_user", "notifications", ["user_id", "read_at", "created_at"])
    if op.get_bind().dialect.name == "postgresql":  # same tenant wall as every other table (see 0007)
        op.execute("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE notifications FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON notifications USING (organization_id = {CURRENT_ORG}) "
            f"WITH CHECK (organization_id = {CURRENT_ORG})"
        )


def downgrade() -> None:
    op.drop_index("ix_notifications_user", table_name="notifications")
    op.drop_table("notifications")