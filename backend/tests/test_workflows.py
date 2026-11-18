"""Workflow automation: definitions, runs (LangGraph), triggers, approval hand-off, retry, cancel."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.db.models import ApprovalRequest, EmailDraft, Lead, WorkflowExecution
from app.main import app
from app.services import approvals as approvals_service
from app.services.llm import LLMError, get_chat_llm
from tests.conftest import signup
from tests.test_analytics import make_lead
from tests.test_documents import team_member
from tests.test_emails import GOOD, FakeLLM, SpyProvider

WF = "/api/v1/workflows"
EX = "/api/v1/workflows/executions"
APPROVALS = "/api/v1/approvals"

FULL = {
    "name": "High-priority follow-up",
    "trigger_type": "manual",
    "conditions": [{"field": "priority", "op": "eq", "value": "high"}],
    "actions": [
        {"type": "draft_email", "tone": "professional", "purpose": "introduction"},
        {"type": "request_approval"},
    ],
}


class WriterLLM(FakeLLM):
    """Has both `complete` (inherited) and `chat`, like the real client."""

    model = "fake-writer"

    def chat(self, messages, tools, *, max_tokens):  # pragma: no cover - not used by workflows
        raise AssertionError("workflows use complete()")


@pytest.fixture
def llm():
    fake = WriterLLM(GOOD)
    app.dependency_overrides[get_chat_llm] = lambda: fake
    return fake


@pytest.fixture
def spy(monkeypatch):
    p = SpyProvider()
    monkeypatch.setattr(approvals_service, "get_email_provider", lambda: p)
    return p


def make_wf(client, h, **kw):
    r = client.post(WF, headers=h, json=FULL | kw)
    assert r.status_code == 201, r.text
    return r.json()


def run(client, h, wf, lead):
    return client.post(f"{WF}/{wf['id']}/execute", headers=h, json={"lead_id": lead["id"]})


def lead_hi(client, h, **kw):
    return make_lead(client, h, name="Priya", email="priya@x.com", priority="high", **kw)


# ---------------------------------------------------------------- definitions
def test_create_read_update_delete(client):
    h = signup(client)
    w = make_wf(client, h)
    assert w["run_count"] == 0 and w["last_run"] is None and w["is_active"] is True
    assert client.get(f"{WF}/{w['id']}", headers=h).json()["name"] == FULL["name"]
    assert [x["id"] for x in client.get(WF, headers=h).json()] == [w["id"]]
    r = client.patch(f"{WF}/{w['id']}", headers=h, json={"is_active": False, "name": "Renamed"})
    assert r.json()["is_active"] is False and r.json()["name"] == "Renamed"
    assert client.patch(f"{WF}/{w['id']}", headers=h, json={}).status_code == 422
    assert client.delete(f"{WF}/{w['id']}", headers=h).status_code == 204
    assert client.get(f"{WF}/{w['id']}", headers=h).status_code == 404


@pytest.mark.parametrize(
    "patch",
    [
        {"actions": []},
        {"actions": [{"type": "request_approval"}]},  # nothing drafted yet
        {"actions": [{"type": "draft_email"}, {"type": "request_approval"}, {"type": "update_lead", "status": "contacted"}]},  # approval must be last
        {"actions": [{"type": "send_email"}]},  # unknown action
        {"actions": [{"type": "update_lead"}]},  # nothing to change
        {"actions": [{"type": "draft_email", "tone": "rude"}]},
        {"actions": [{"type": "draft_email", "sql": "x"}]},
        {"actions": [{"type": "update_lead", "status": "contacted"}] * 7},
        {"conditions": [{"field": "priority", "op": "eq", "value": "urgent"}]},
        {"conditions": [{"field": "days_since_contact", "op": "eq", "value": 3}]},
        {"conditions": [{"field": "has_email", "op": "eq", "value": "yes"}]},
        {"conditions": [{"field": "salary", "op": "eq", "value": 1}]},
        {"trigger_type": "cron"},
        {"name": ""},
        {"organization_id": "x"},
    ],
)
def test_invalid_definitions_are_rejected(client, patch):
    h = signup(client)
    assert client.post(WF, headers=h, json=FULL | patch).status_code == 422


def test_roles(client):
    owner = signup(client)
    mgr = team_member(client, owner, "manager", "m@acme.com")
    emp = team_member(client, owner, "employee", "e@acme.com")
    assert client.post(WF, headers=mgr, json=FULL).status_code == 403  # only admins define workflows
    w = make_wf(client, owner)
    assert client.get(WF, headers=emp).status_code == 200  # everyone can look
    assert client.patch(f"{WF}/{w['id']}", headers=mgr, json={"is_active": False}).status_code == 403
    assert client.delete(f"{WF}/{w['id']}", headers=mgr).status_code == 403
    lead = lead_hi(client, owner)
    assert run(client, emp, w, lead).status_code == 403  # employees can't run
    assert client.post(f"{WF}/{w['id']}/execute", headers=mgr, json={"lead_id": lead["id"]}).status_code == 201


def test_tenant_isolation(client, llm):
    a, b = signup(client), signup(client, email="b@o.com", org="Other", name="Bob")
    w = make_wf(client, a)
    lead_a = lead_hi(client, a)
    assert client.get(f"{WF}/{w['id']}", headers=b).status_code == 404
    assert client.patch(f"{WF}/{w['id']}", headers=b, json={"is_active": False}).status_code == 404
    assert client.get(WF, headers=b).json() == []
    assert run(client, b, w, lead_a).status_code == 404
    ex = run(client, a, w, lead_a).json()
    assert client.get(f"{EX}/{ex['id']}", headers=b).status_code == 404
    assert client.post(f"{EX}/{ex['id']}/cancel", headers=b).status_code == 404
    assert client.get(EX, headers=b).json()["total"] == 0
    # and B can't point their own workflow at A's lead
    wb = make_wf(client, b)
    assert run(client, b, wb, lead_a).status_code == 404


# ---------------------------------------------------------------- running
def test_manual_run_drafts_then_waits_for_approval(client, llm, spy):
    h = signup(client)
    w = make_wf(client, h)
    lead = lead_hi(client, h)
    r = run(client, h, w, lead)
    assert r.status_code == 201, r.text
    ex = r.json()
    assert ex["status"] == "waiting_approval" and ex["cursor"] == 2 and ex["total_steps"] == 2
    assert [s["status"] for s in ex["steps"]] == ["ok", "waiting"]
    assert spy.sent == []  # drafted and asked, but nothing sent
    ap = client.get(APPROVALS, headers=h).json()["items"][0]
    assert ap["status"] == "pending" and ap["id"] == ex["context"]["approval_id"]
    assert client.get(WF, headers=h).json()[0]["last_run"]["status"] == "waiting_approval"


def test_approving_completes_the_run(client, llm, spy):
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    client.post(f"{APPROVALS}/{ex['context']['approval_id']}/approve", headers=h)
    done = client.get(f"{EX}/{ex['id']}", headers=h).json()
    assert done["status"] == "completed" and done["finished_at"]
    assert done["steps"][-1]["status"] == "ok" and "simulated" in done["steps"][-1]["summary"]
    assert len(spy.sent) == 1


def test_rejecting_cancels_the_run(client, llm, spy):
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    client.post(f"{APPROVALS}/{ex['context']['approval_id']}/reject", headers=h, json={"note": "no"})
    done = client.get(f"{EX}/{ex['id']}", headers=h).json()
    assert done["status"] == "cancelled" and "rejected" in done["error_message"]
    assert spy.sent == []


def test_conditions_not_met_skips_without_ai_calls(client, llm):
    h = signup(client)
    w = make_wf(client, h)
    low = make_lead(client, h, name="Low", email="l@x.com", priority="low")
    ex = run(client, h, w, low).json()
    assert ex["status"] == "skipped" and "priority" in ex["error_message"] and ex["steps"] == []
    assert llm.calls == []


def test_update_lead_action(client):
    h = signup(client)
    w = make_wf(client, h, actions=[{"type": "update_lead", "status": "qualified", "priority": "medium"}])
    lead = lead_hi(client, h)
    ex = run(client, h, w, lead).json()
    assert ex["status"] == "completed"
    now = client.get(f"/api/v1/leads/{lead['id']}", headers=h).json()
    assert (now["status"], now["priority"]) == ("qualified", "medium")


def test_condition_operators(client, llm):
    h = signup(client)
    conds = [
        {"field": "city", "op": "eq", "value": "delhi"},
        {"field": "status", "op": "neq", "value": "won"},
        {"field": "days_since_contact", "op": "gte", "value": 7},
        {"field": "has_email", "op": "eq", "value": True},
    ]
    w = make_wf(client, h, conditions=conds, actions=[{"type": "update_lead", "priority": "high"}])
    ok = make_lead(client, h, name="A", email="a@x.com", city="Delhi")  # never contacted counts as long ago
    assert run(client, h, w, ok).json()["status"] == "completed"
    recent = make_lead(client, h, name="B", email="b@x.com", city="Delhi", last_contacted_at=datetime.now(timezone.utc).isoformat())
    assert run(client, h, w, recent).json()["status"] == "skipped"
    noemail = make_lead(client, h, name="C", city="Delhi")
    assert run(client, h, w, noemail).json()["status"] == "skipped"
    won = make_lead(client, h, name="D", email="d@x.com", city="Delhi", status="won")
    assert run(client, h, w, won).json()["status"] == "skipped"


def test_paused_workflow_cannot_run(client, llm):
    h = signup(client)
    w = make_wf(client, h, is_active=False)
    assert run(client, h, w, lead_hi(client, h)).status_code == 409


# ---------------------------------------------------------------- failure, retry, cancel
class FlakyLLM(WriterLLM):
    def __init__(self, failures):
        super().__init__(GOOD)
        self.failures = failures

    def complete(self, system, user, *, max_tokens):
        if self.failures > 0:
            self.failures -= 1
            raise LLMError("The AI service is busy (free-tier rate limit). Wait a minute and try again.")
        return super().complete(system, user, max_tokens=max_tokens)


def test_one_transient_ai_failure_is_retried_inside_the_step(client):
    app.dependency_overrides[get_chat_llm] = lambda: FlakyLLM(1)
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    assert ex["status"] == "waiting_approval"


def test_failed_run_can_be_retried_from_the_failed_step(client, spy):
    flaky = FlakyLLM(2)  # fails both attempts of the first run
    app.dependency_overrides[get_chat_llm] = lambda: flaky
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    assert ex["status"] == "failed" and "busy" in ex["error_message"] and ex["cursor"] == 0
    assert ex["steps"][0]["status"] == "error"
    again = client.post(f"{EX}/{ex['id']}/retry", headers=h).json()
    assert again["status"] == "waiting_approval" and again["attempts"] == 2
    assert [s["status"] for s in again["steps"]] == ["error", "ok", "waiting"]  # history is kept


def test_retry_only_for_failed_and_is_limited(client):
    app.dependency_overrides[get_chat_llm] = lambda: FlakyLLM(10_000)
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    for _ in range(4):
        assert client.post(f"{EX}/{ex['id']}/retry", headers=h).json()["status"] == "failed"
    assert client.post(f"{EX}/{ex['id']}/retry", headers=h).status_code == 409  # 5 tries used
    ok = run(client, h, make_wf(client, h, name="two", actions=[{"type": "update_lead", "status": "contacted"}]), lead_hi(client, h)).json()
    assert client.post(f"{EX}/{ok['id']}/retry", headers=h).status_code == 409  # not failed


def test_lead_without_email_fails_the_draft_step(client, llm):
    h = signup(client)
    ex = run(client, h, make_wf(client, h, conditions=[]), make_lead(client, h, name="No mail")).json()
    assert ex["status"] == "failed" and "no email" in ex["error_message"]


def test_cancel_while_waiting_withdraws_the_approval(client, llm, spy):
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    c = client.post(f"{EX}/{ex['id']}/cancel", headers=h)
    assert c.json()["status"] == "cancelled"
    ap = client.get(f"{APPROVALS}/{ex['context']['approval_id']}", headers=h).json()
    assert ap["status"] == "cancelled"
    assert client.post(f"{APPROVALS}/{ap['id']}/approve", headers=h).status_code == 409
    assert spy.sent == []
    with client.session_factory() as db:
        assert db.scalar(select(EmailDraft)).status == "draft"
    assert client.post(f"{EX}/{ex['id']}/cancel", headers=h).status_code == 409  # already final


def test_cancelling_the_approval_cancels_the_run(client, llm):
    h = signup(client)
    ex = run(client, h, make_wf(client, h), lead_hi(client, h)).json()
    client.post(f"{APPROVALS}/{ex['context']['approval_id']}/cancel", headers=h)
    assert client.get(f"{EX}/{ex['id']}", headers=h).json()["status"] == "cancelled"


def test_cannot_delete_workflow_with_runs_in_progress(client, llm):
    h = signup(client)
    w = make_wf(client, h)
    ex = run(client, h, w, lead_hi(client, h)).json()
    assert client.delete(f"{WF}/{w['id']}", headers=h).status_code == 409
    client.post(f"{EX}/{ex['id']}/cancel", headers=h)
    assert client.delete(f"{WF}/{w['id']}", headers=h).status_code == 204
    assert client.get(f"{EX}/{ex['id']}", headers=h).json()["workflow_name"] == FULL["name"]  # history survives


def test_run_uses_a_snapshot_of_the_definition(client, llm):
    h = signup(client)
    w = make_wf(client, h, actions=[{"type": "draft_email"}])
    lead = lead_hi(client, h)
    ex = run(client, h, w, lead).json()
    client.patch(f"{WF}/{w['id']}", headers=h, json={"actions": [{"type": "update_lead", "status": "lost"}]})
    assert client.get(f"{EX}/{ex['id']}", headers=h).json()["total_steps"] == 1
    with client.session_factory() as db:
        assert db.scalar(select(WorkflowExecution)).definition["actions"][0]["type"] == "draft_email"


# ---------------------------------------------------------------- triggers
def test_lead_created_trigger_runs_matching_workflows_in_background(client, llm, spy):
    h = signup(client)
    make_wf(client, h, trigger_type="lead_created")
    other = make_wf(client, h, name="Only Mumbai", trigger_type="lead_created", conditions=[{"field": "city", "op": "eq", "value": "Mumbai"}])
    lead = lead_hi(client, h, city="Delhi")  # background tasks finish before the TestClient returns
    runs = client.get(EX, headers=h).json()["items"]
    assert len(runs) == 1 and runs[0]["trigger_source"] == "lead_created" and runs[0]["lead_id"] == lead["id"]
    assert runs[0]["status"] == "waiting_approval"
    assert spy.sent == []
    assert client.get(f"{WF}/{other['id']}", headers=h).json()["run_count"] == 0


def test_paused_and_manual_workflows_do_not_trigger(client, llm):
    h = signup(client)
    make_wf(client, h, is_active=False, trigger_type="lead_created")
    make_wf(client, h, name="manual one", trigger_type="manual")
    lead_hi(client, h)
    assert client.get(EX, headers=h).json()["total"] == 0


def test_trigger_is_per_organization(client, llm):
    a, b = signup(client), signup(client, email="b@o.com", org="Other", name="Bob")
    make_wf(client, a, trigger_type="lead_created")
    lead_hi(client, b)
    assert client.get(EX, headers=a).json()["total"] == 0


def test_agent_created_lead_queues_a_run_a_person_can_start(client, llm, spy):
    from tests.test_agent import CHAT, say, tool_call, use

    h = signup(client)
    make_wf(client, h, trigger_type="lead_created")
    use(tool_call(("create_lead", {"name": "Zed", "email": "z@x.com", "priority": "high"})), say("Created."))
    client.post(CHAT, headers=h, json={"message": "add lead Zed"})
    queued = client.get(EX, headers=h).json()["items"]
    assert len(queued) == 1 and queued[0]["status"] == "queued" and queued[0]["steps"] == []
    app.dependency_overrides[get_chat_llm] = lambda: WriterLLM(GOOD)  # the chat script is used up
    started = client.post(f"{EX}/{queued[0]['id']}/run", headers=h).json()
    assert started["status"] == "waiting_approval"
    assert client.post(f"{EX}/{queued[0]['id']}/run", headers=h).status_code == 409  # can't start twice
    assert spy.sent == []


def test_dashboard_counts_are_real(client, llm):
    h = signup(client)
    make_wf(client, h)
    ex = run(client, h, make_wf(client, h, name="x"), lead_hi(client, h)).json()
    kpis = client.get("/api/v1/dashboard/overview", headers=h).json()["kpis"]
    assert kpis["active_workflows"] == 2 and kpis["pending_approvals"] >= 1


# ---------------------------------------------------------------- agent tool
def test_agent_can_report_workflow_status(client, llm):
    from tests.test_agent import CHAT, say, tool_call, use

    h = signup(client)
    w = make_wf(client, h)
    run(client, h, w, lead_hi(client, h))
    use(tool_call(("get_workflow_status", {"workflow_name": "follow"})), say("One run is waiting."))
    r = client.post(CHAT, headers=h, json={"message": "how are my workflows doing?"}).json()
    data = next(b for b in r["assistant_message"]["blocks"] if b["type"] == "workflow_status")["data"]
    assert data["workflows"][0]["recent_runs"][0]["status"] == "waiting_approval"
    use(tool_call(("get_workflow_status", {"workflow_name": "nope"})), say("None."))
    r = client.post(CHAT, headers=h, json={"message": "status of nope"}).json()
    tools = next(b for b in r["assistant_message"]["blocks"] if b["type"] == "activity")["tools"]
    assert tools[0]["status"] == "error"


# ---------------------------------------------------------------- daily briefing
def test_briefing(client, llm):
    h = signup(client)
    lead_hi(client, h)  # high priority, never contacted
    make_lead(client, h, name="Low", priority="low")
    items = {i["key"]: i for i in client.get("/api/v1/dashboard/briefing", headers=h).json()["items"]}
    assert items["new_leads"]["value"] == "2"
    assert items["quiet_high_priority"]["value"] == "1" and items["quiet_high_priority"]["tone"] == "warn"
    assert items["pending_approvals"]["value"] == "0" and items["pending_approvals"]["tone"] == "good"
    assert {"failed_runs", "revenue"} <= set(items)


def test_briefing_is_org_scoped_and_needs_login(client):
    a, b = signup(client), signup(client, email="b@o.com", org="Other", name="Bob")
    lead_hi(client, a)
    assert {i["key"]: i for i in client.get("/api/v1/dashboard/briefing", headers=b).json()["items"]}["new_leads"]["value"] == "0"
    assert client.get("/api/v1/dashboard/briefing").status_code in (401, 403)