"""Tells Postgres which organization the current request belongs to, so Row Level Security (RLS) can
enforce tenant isolation in the database itself, as a second wall behind our own org_id filters.

How it works: every transaction on a bound session starts with
    SELECT set_config('app.current_org', '<org uuid>', true)      -- true = this transaction only
and the RLS policies (migration 0007) compare each row's organization_id with that setting.
A session that never called bind_tenant sees NO tenant rows when connected as the restricted app role.

The organization id comes from the membership row in the database (AuthContext), never from the client.
"""

import uuid

from sqlalchemy import event, text
from sqlalchemy.orm import Session

_KEY = "tenant_org_id"


def bind_tenant(db: Session, organization_id: uuid.UUID) -> None:
    db.info[_KEY] = str(organization_id)
    if db.get_bind().dialect.name == "postgresql" and db.in_transaction():
        _apply(db, db.info[_KEY])  # the transaction that looked up the membership is already open


def _apply(db: Session, org: str) -> None:
    db.execute(text("SELECT set_config('app.current_org', :org, true)"), {"org": org})


@event.listens_for(Session, "after_begin")
def _set_tenant_on_begin(session: Session, transaction, connection) -> None:
    org = session.info.get(_KEY)
    if org and connection.dialect.name == "postgresql":
        connection.execute(text("SELECT set_config('app.current_org', :org, true)"), {"org": org})