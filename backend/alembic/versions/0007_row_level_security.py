"""row level security (Postgres only)

Revision ID: 0007
Revises: 0006

Turns on Row Level Security for every table.

* Tenant tables (rows that carry organization_id): a row is visible and writable only when its
  organization_id equals the `app.current_org` setting that the API sets for each transaction.
  If the setting is missing, NO rows match. This policy applies to every role without BYPASSRLS,
  including Supabase's `anon` and `authenticated` roles, so the auto-generated Supabase REST API
  cannot read our tables.
* Identity tables (organizations, profiles, organization_members): needed before an organization is
  known (login, sign-up), so they are open to the restricted app role `nexora_app` only. Everyone else
  gets nothing.

The default `postgres` role in Supabase bypasses RLS, so RLS is enforced for the API only if it connects
as the restricted role. See scripts/app_role.sql and docs. SQLite (local dev) is skipped.
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

TENANT_TABLES = (
    "leads", "sales", "documents", "document_chunks", "conversations", "messages", "agent_runs",
    "tool_executions", "email_drafts", "approval_requests", "workflows", "workflow_executions", "activity_logs",
)
IDENTITY_TABLES = ("organizations", "profiles", "organization_members")
CURRENT_ORG = "nullif(current_setting('app.current_org', true), '')::uuid"


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for t in TENANT_TABLES:
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {t} USING (organization_id = {CURRENT_ORG}) "
            f"WITH CHECK (organization_id = {CURRENT_ORG})"
        )
    for t in IDENTITY_TABLES:
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexora_app') THEN
                CREATE POLICY app_access ON {t} TO nexora_app USING (true) WITH CHECK (true);
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for t in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {t}")
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY")
    for t in IDENTITY_TABLES:
        op.execute(f"DROP POLICY IF EXISTS app_access ON {t}")
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY")