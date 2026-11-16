"""Runs an analytics query with as little power as possible.

Defence in depth: the queries are already SELECT-only by construction (see engine.py), and on top
of that this module
  * refuses to run anything that is not a plain SELECT,
  * on PostgreSQL runs it in a READ ONLY transaction with a statement timeout,
  * can send it to a separate, read-only database login (ANALYTICS_DATABASE_URL), whose
    permissions are limited to the approved tables and columns (backend/scripts/readonly_role.sql).
"""

import logging
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from app.analyst.spec import AnalyticsError
from app.core.config import get_settings

log = logging.getLogger(__name__)


@lru_cache
def _dedicated_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2) if not url.startswith("sqlite") else create_engine(url)


def run_select(db: Session, stmt: Select) -> list:
    if not isinstance(stmt, Select):
        raise AnalyticsError("Only read-only queries can be run.")  # unreachable by design; kept as a tripwire
    settings = get_settings()
    dedicated = settings.analytics_database_url
    engine = _dedicated_engine(dedicated) if dedicated else db.get_bind()
    try:
        if engine.dialect.name == "postgresql":
            # A separate connection, so the read-only setting can't leak into the caller's transaction.
            with engine.connect() as conn:
                conn.execute(text("SET TRANSACTION READ ONLY"))
                conn.execute(text(f"SET LOCAL statement_timeout = {int(settings.analytics_timeout_ms)}"))
                return list(conn.execute(stmt))
        if dedicated:
            with engine.connect() as conn:
                return list(conn.execute(stmt))
        return list(db.execute(stmt))  # SQLite (development/tests): SELECT-only by construction
    except DBAPIError as e:
        log.error("Analytics query failed: %s", type(e.orig).__name__ if e.orig else type(e).__name__)
        if "statement timeout" in str(e.orig).lower():
            raise AnalyticsError("That question took too long to calculate. Try a shorter period or a narrower filter.") from None
        raise AnalyticsError("The analytics query could not be run.") from None
