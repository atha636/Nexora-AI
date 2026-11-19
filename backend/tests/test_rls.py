"""Row Level Security, tested against a real Postgres as the RESTRICTED role.

Runs only when TEST_DATABASE_URL points at Postgres (a superuser connection, so the test can create the
schema with Alembic and the restricted `nexora_app` role). It wipes that database.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from app.db.tenancy import bind_tenant

ADMIN_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not ADMIN_URL.startswith("postgresql"), reason="needs Postgres (set TEST_DATABASE_URL)")
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def engines():
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text("DROP SCHEMA public CASCADE"))
        c.execute(text("CREATE SCHEMA public"))
        c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        c.execute(
            text(
                "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexora_app') THEN "
                "CREATE ROLE nexora_app LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$"
            )
        )
        c.execute(text("ALTER ROLE nexora_app WITH LOGIN PASSWORD 'apppw123' NOSUPERUSER NOBYPASSRLS"))
        c.execute(text("GRANT USAGE ON SCHEMA public TO nexora_app"))
    env = {**os.environ, "DATABASE_URL": ADMIN_URL}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, env=env, check=True, capture_output=True)
    with admin.connect() as c:
        c.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexora_app"))
    app_url = make_url(ADMIN_URL).set(username="nexora_app", password="apppw123")
    app_engine = create_engine(app_url)
    yield admin, app_engine
    app_engine.dispose()
    with admin.connect() as c:
        c.execute(text("DROP SCHEMA public CASCADE"))
        c.execute(text("CREATE SCHEMA public"))
    admin.dispose()


def _lead(org, name):
    return {"id": uuid.uuid4(), "org": org, "name": name}


INSERT = text(
    "INSERT INTO leads (id, organization_id, name, status, priority, source, created_at, updated_at) VALUES (:id, :org, :name, 'new', 'low', 'web', now(), now())"
)


def test_restricted_role_cannot_bypass_rls(engines):
    admin, _ = engines
    with admin.connect() as c:
        row = c.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nexora_app'")).one()
    assert tuple(row) == (False, False)


def test_tenant_isolation_in_the_database(engines):
    _, app_engine = engines
    Session = sessionmaker(bind=app_engine)
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    for org, n in ((org_a, "A"), (org_b, "B")):
        with Session() as s:
            bind_tenant(s, org)
            s.execute(text("INSERT INTO organizations (id, name, created_at) VALUES (:i, :n, now())"), {"i": org, "n": n})
            s.execute(INSERT, _lead(org, f"lead-{n}"))
            s.commit()

    with Session() as s:  # bound to A: sees only A
        bind_tenant(s, org_a)
        assert [r[0] for r in s.execute(text("SELECT name FROM leads"))] == ["lead-A"]
        # bound sessions keep the binding across commits (it is re-applied on each new transaction)
        s.commit()
        assert s.execute(text("SELECT count(*) FROM leads")).scalar() == 1

    with Session() as s:  # never bound: sees nothing at all
        assert s.execute(text("SELECT count(*) FROM leads")).scalar() == 0

    with Session() as s:  # A cannot write a row for B
        bind_tenant(s, org_a)
        with pytest.raises(DBAPIError):
            s.execute(INSERT, _lead(org_b, "sneaky"))
        s.rollback()

    with Session() as s:  # A cannot touch B's row (it is invisible, so 0 rows change)
        bind_tenant(s, org_a)
        assert s.execute(text("UPDATE leads SET name = 'hacked' WHERE name = 'lead-B'")).rowcount == 0
        assert s.execute(text("DELETE FROM leads WHERE name = 'lead-B'")).rowcount == 0
        s.commit()
    with Session() as s:
        bind_tenant(s, org_b)
        assert s.execute(text("SELECT name FROM leads")).scalar() == "lead-B"


def test_whole_api_works_as_restricted_role_and_stays_isolated(engines):
    from app.db.session import get_db, get_session_factory
    from app.main import app
    from app.services.embeddings import HashEmbedder, get_embedder

    _, app_engine = engines
    Session = sessionmaker(bind=app_engine, autoflush=False, autocommit=False)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_session_factory] = lambda: Session
    app.dependency_overrides[get_embedder] = lambda: HashEmbedder()
    try:
        with TestClient(app) as c:
            def signup(email, org):
                r = c.post("/api/v1/auth/signup", json={"email": email, "password": "supersecret1", "full_name": "Pat", "organization_name": org})
                assert r.status_code == 201, r.text
                return {"Authorization": f"Bearer {r.json()['access_token']}"}

            a, b = signup("a@rls.com", "RLS A"), signup("b@rls.com", "RLS B")
            lead = c.post("/api/v1/leads", headers=a, json={"name": "Priya", "email": "p@x.com", "priority": "high"})
            assert lead.status_code == 201, lead.text
            assert c.get("/api/v1/leads", headers=a).json()["total"] == 1
            assert c.get("/api/v1/leads", headers=b).json()["total"] == 0
            assert c.get(f"/api/v1/leads/{lead.json()['id']}", headers=b).status_code == 404
            assert c.get("/api/v1/dashboard/overview", headers=a).status_code == 200
            up = c.post("/api/v1/documents/upload", headers=a, files={"file": ("n.txt", b"Refunds are issued within 14 days.", "text/plain")})
            assert up.status_code == 202, up.text
            docs = c.get("/api/v1/documents", headers=a).json()
            assert (docs["items"] if isinstance(docs, dict) else docs)[0]["status"] == "ready"  # background job worked under RLS
            link = c.post("/api/v1/auth/forgot-password", json={"email": "a@rls.com"}).json()["dev_reset_link"]
            from urllib.parse import unquote

            token = unquote(link.split("token=")[1])
            assert c.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "newpassword12"}).status_code == 200
    finally:
        app.dependency_overrides.clear()