import uuid
from datetime import timedelta

from app.db.models import ActivityLog, AgentRun, ToolExecution, utcnow
from tests.conftest import signup
from tests.test_workflows import team_member


def _seed(client, headers, *, minutes_ago=1, status="completed", duration=1200, tokens=(100, 50)):
    me = client.get("/api/v1/auth/me", headers=headers).json()
    org = uuid.UUID(me["organization"]["id"] if "organization" in me else me["organization_id"])
    with client.session_factory() as db:
        run = AgentRun(
            organization_id=org, user_id=uuid.UUID(me["id"]), trace_id=uuid.uuid4().hex, status=status, model="m", steps=2,
            tool_call_count=2, prompt_tokens=tokens[0], completion_tokens=tokens[1], duration_ms=duration,
            started_at=utcnow() - timedelta(minutes=minutes_ago), finished_at=utcnow() if status != "running" else None,
            error_message="boom" if status == "failed" else None,
        )
        db.add(run)
        db.flush()
        for i, (name, st, ms) in enumerate([("search_leads", "ok", 40), ("update_lead", "blocked", 5)], start=1):
            db.add(ToolExecution(run_id=run.id, organization_id=org, sequence=i, tool_name=name, status=st, arguments={"q": "x"}, duration_ms=ms))
        db.add(ActivityLog(organization_id=org, actor_id=uuid.UUID(me["id"]), entity_type="lead", action="lead.created", details={"a": 1}))
        db.add(ActivityLog(organization_id=org, actor_id=uuid.UUID(me["id"]), entity_type="approval", action="approval.approved"))
        db.commit()
        return str(run.id)


def test_run_list_trace_and_stats(client):
    h = signup(client)
    run_id = _seed(client, h)
    _seed(client, h, status="failed", duration=3000)
    runs = client.get("/api/v1/agent/runs", headers=h).json()
    assert runs["total"] == 2 and runs["items"][0]["user_name"] == "Olivia Owner"
    assert client.get("/api/v1/agent/runs?status=failed", headers=h).json()["total"] == 1

    trace = client.get(f"/api/v1/agent/runs/{run_id}/trace", headers=h).json()
    assert [t["tool_name"] for t in trace["timeline"]] == ["search_leads", "update_lead"]
    assert [t["offset_ms"] for t in trace["timeline"]] == [0, 40]
    assert trace["run"]["total_tokens"] == 150

    st = client.get("/api/v1/observability/stats", headers=h).json()
    assert st["runs"] == 2 and st["failed"] == 1 and st["failure_rate"] == 0.5
    assert st["blocked_tool_calls"] == 2 and st["total_tokens"] == 300
    assert st["by_tool"][0]["calls"] == 2


def test_activity_filter_and_pagination(client):
    h = signup(client)
    _seed(client, h)
    allr = client.get("/api/v1/activity", headers=h).json()
    assert allr["total"] >= 2
    only = client.get("/api/v1/activity?action=approval", headers=h).json()
    assert only["total"] == 1 and only["items"][0]["action"] == "approval.approved"
    assert client.get("/api/v1/activity?action=%25", headers=h).json()["total"] == 0  # wildcard is escaped
    assert len(client.get("/api/v1/activity?limit=1", headers=h).json()["items"]) == 1


def test_permissions_and_isolation(client):
    owner = signup(client)
    emp = team_member(client, owner, "employee", "e@acme.com")
    run_id = _seed(client, owner)
    for path in ("agent/runs", "activity", "observability/stats"):
        assert client.get(f"/api/v1/{path}", headers=emp).status_code == 403
    assert client.get(f"/api/v1/agent/runs/{run_id}/trace", headers=emp).status_code == 404  # not their run
    other = signup(client, "b@o.com", "Other", "Bob")
    assert client.get(f"/api/v1/agent/runs/{run_id}/trace", headers=other).status_code == 404
    assert client.get("/api/v1/agent/runs", headers=other).json()["total"] == 0
    assert "lead.created" not in [i["action"] for i in client.get("/api/v1/activity", headers=other).json()["items"]]


def test_employee_sees_own_trace_and_listing_sweeps_stale_runs(client):
    owner = signup(client)
    emp = team_member(client, owner, "employee", "e@acme.com")
    mine = _seed(client, emp)
    assert client.get(f"/api/v1/agent/runs/{mine}/trace", headers=emp).status_code == 200
    _seed(client, owner, minutes_ago=60, status="running")
    runs = client.get("/api/v1/agent/runs?status=failed", headers=owner).json()
    assert runs["total"] == 1 and "interrupted" in runs["items"][0]["error_message"]