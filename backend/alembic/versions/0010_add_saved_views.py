"""add saved views (named lead filters)

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "saved_views",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_saved_views_org_owner", "saved_views", ["organization_id", "owner_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE saved_views FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON saved_views USING (organization_id = {CURRENT_ORG}) "
            f"WITH CHECK (organization_id = {CURRENT_ORG})"
        )


def downgrade() -> None:
    op.drop_table("saved_views")