import logging
from datetime import timedelta

import pytest

from app.core.config import get_settings
from app.core.logging_safety import redact
from app.core.ratelimit import RateLimiter, limiter
from app.core.security import create_access_token, create_reset_token, decode_access_token, decode_reset_token
from app.db.models import AgentRun, Workflow, WorkflowExecution, utcnow
from app.services.sweeper import sweep_stuck_runs
from tests.conftest import signup


# ---------- rate limiter ----------
def test_limiter_blocks_then_recovers():
    rl = RateLimiter()
    assert rl.hit("k", 2, 60, now=100) is None
    assert rl.hit("k", 2, 60, now=101) is None
    wait = rl.hit("k", 2, 60, now=102)
    assert wait and wait <= 60
    assert rl.hit("k", 2, 60, now=161) is None  # the first hit has left the window
    assert rl.hit("other", 2, 60, now=102) is None  # keys are independent


def test_login_is_rate_limited(client):
    get_settings().rate_limit_enabled = True
    limiter.reset()
    codes = [client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "wrongpass1"}).status_code for _ in range(12)]
    assert codes[:10] == [401] * 10
    assert 429 in codes[10:]
    res = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "wrongpass1"})
    assert res.status_code == 429 and int(res.headers["Retry-After"]) >= 1


def test_ai_endpoint_limit_is_per_user(client):
    get_settings().rate_limit_enabled = True
    limiter.reset()
    h1 = signup(client, "a@a.com", "A")
    h2 = signup(client, "b@b.com", "B")
    for _ in range(20):
        client.post("/api/v1/agent/chat", json={"message": "hi"}, headers=h1)
    assert client.post("/api/v1/agent/chat", json={"message": "hi"}, headers=h1).status_code == 429
    assert client.post("/api/v1/agent/chat", json={"message": "hi"}, headers=h2).status_code != 429


# ---------- headers and errors ----------
def test_security_headers_and_request_id(client):
    res = client.get("/api/v1/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in res.headers["content-security-policy"]
    assert len(res.headers["x-request-id"]) == 16


def test_docs_page_keeps_scripts_working(client):
    assert "content-security-policy" not in client.get("/docs").headers


def test_unhandled_error_is_generic(client):
    from app.main import app

    @app.get("/boom-test")
    def boom():
        raise RuntimeError("secret detail postgresql://u:pw@h/db")

    from fastapi.testclient import TestClient

    res = TestClient(app, raise_server_exceptions=False).get("/boom-test")
    assert res.status_code == 500
    assert "secret" not in res.text and "postgresql" not in res.text
    assert res.json()["request_id"]


# ---------- log redaction ----------
@pytest.mark.parametrize(
    "raw,hidden",
    [
        ("Authorization: Bearer abcdef1234567890", "abcdef1234567890"),
        ("key gsk_abcdefghij1234567890", "gsk_abcdefghij1234567890"),
        ("postgresql://postgres:hunter2pass@db.example.com:5432/x", "hunter2pass"),
        ("contact jane.doe@acme.com now", "jane.doe@acme.com"),
        ("password=SuperSecret99", "SuperSecret99"),
    ],
)
def test_redaction(raw, hidden):
    assert hidden not in redact(raw)


def test_log_records_are_redacted(caplog):
    with caplog.at_level(logging.INFO):
        logging.getLogger("nexora").info("token gsk_abcdefghij1234567890 for jane@acme.com")
    assert "gsk_abcdefghij" not in caplog.text and "jane@acme.com" not in caplog.text


# ---------- password reset ----------
def test_forgot_password_is_neutral_and_dev_link_works(client):
    signup(client, "owner@acme.com")
    known = client.post("/api/v1/auth/forgot-password", json={"email": "owner@acme.com"})
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@acme.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json()["detail"] == unknown.json()["detail"]
    assert unknown.json()["dev_reset_link"] is None
    assert "reset-password?token=" in known.json()["dev_reset_link"]


def test_reset_flow_changes_password_once(client):
    signup(client, "owner@acme.com", password="oldpassword1")
    link = client.post("/api/v1/auth/forgot-password", json={"email": "owner@acme.com"}).json()["dev_reset_link"]
    token = link.split("token=")[1]
    from urllib.parse import unquote

    token = unquote(token)
    ok = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "brandnewpass1"})
    assert ok.status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "owner@acme.com", "password": "oldpassword1"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "owner@acme.com", "password": "brandnewpass1"}).status_code == 200
    again = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "anotherpass12"})
    assert again.status_code == 400  # single use


def test_tokens_are_not_interchangeable(client):
    signup(client, "owner@acme.com")
    reset = create_reset_token("00000000-0000-0000-0000-000000000001", "hash")
    assert decode_access_token(reset) is None
    assert decode_reset_token(create_access_token("x")) is None
    assert decode_reset_token("garbage") is None


def test_bad_reset_token_rejected(client):
    res = client.post("/api/v1/auth/reset-password", json={"token": "not-a-real-token-123", "new_password": "brandnewpass1"})
    assert res.status_code == 400


# ---------- sweeper ----------
def test_sweeper_fails_only_old_running_runs(client):
    h = signup(client)
    me = client.get("/api/v1/auth/me", headers=h).json()
    org_id = me["organization"]["id"] if "organization" in me else me["organization_id"]
    import uuid

    with client.session_factory() as db:
        org = uuid.UUID(org_id)
        old = utcnow() - timedelta(minutes=30)
        db.add(AgentRun(organization_id=org, user_id=uuid.UUID(me["id"]), trace_id="t1", status="running", model="m", started_at=old))
        db.add(AgentRun(organization_id=org, user_id=uuid.UUID(me["id"]), trace_id="t2", status="running", model="m", started_at=utcnow()))
        db.commit()
        assert sweep_stuck_runs(db) == 1
        statuses = {r.trace_id: r.status for r in db.query(AgentRun).all()}
    assert statuses == {"t1": "failed", "t2": "running"}