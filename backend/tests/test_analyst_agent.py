"""The AI side of analytics: the query_analytics tool, analyst mode, and the HTTP endpoints."""

from sqlalchemy import select

from app.db.models import AgentRun
from tests.conftest import signup
from tests.test_agent import CHAT, say, tool_call, use
from tests.test_analytics import make_lead, record_sale

ASK = "/api/v1/analytics/ask"
QUERY = "/api/v1/analytics/query"


def seed(client, h):
    lead = make_lead(client, h, city="Delhi", status="won")
    record_sale(client, h, 1000, days_ago=40, lead_id=lead["id"])
    record_sale(client, h, 500, days_ago=2, lead_id=lead["id"])


def test_ask_runs_query_and_returns_result(client):
    h = signup(client)
    seed(client, h)
    fake = use(tool_call(("query_analytics", {"metric": "revenue", "group_by": "city", "period": "all_time"})), say("Delhi leads with INR 1,500."))
    res = client.post(ASK, headers=h, json={"question": "Which city generated the highest revenue?"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"] == "Delhi leads with INR 1,500."
    assert body["results"][0]["rows"][0] == {"label": "Delhi", "value": 1500.0}
    assert body["tools"][0]["name"] == "query_analytics" and body["tools"][0]["status"] == "ok"
    # analyst mode offers the model ONLY the analytics tool
    offered = [t["function"]["name"] for t in fake.calls[0][1]]
    assert offered == ["query_analytics"]


def test_analyst_cannot_call_write_tools(client):
    h = signup(client)
    use(tool_call(("create_lead", {"name": "Eve"})), say("Could not."))
    body = client.post(ASK, headers=h, json={"question": "please add a lead named Eve"}).json()
    assert body["tools"][0]["status"] != "ok"
    assert client.get("/api/v1/leads", headers=h).json()["total"] == 0


def test_bad_query_is_reported_to_model_not_crash(client):
    h = signup(client)
    use(tool_call(("query_analytics", {"metric": "revenue", "group_by": "status"})), say("That grouping isn't available."))
    body = client.post(ASK, headers=h, json={"question": "revenue by status"}).json()
    assert body["tools"][0]["status"] == "error" and body["results"] == []


def test_model_cannot_smuggle_sql_or_org(client):
    h = signup(client)
    use(tool_call(("query_analytics", {"metric": "revenue", "sql": "DROP TABLE sales", "organization_id": "x"})), say("ok"))
    body = client.post(ASK, headers=h, json={"question": "revenue please"}).json()
    assert body["tools"][0]["status"] == "error" and body["results"] == []


def test_tenant_isolation(client):
    a, b = signup(client), signup(client, email="b@o.com", org="Other", name="Bob")
    seed(client, a)
    use(tool_call(("query_analytics", {"metric": "revenue", "period": "all_time"})), say("none"))
    body = client.post(ASK, headers=b, json={"question": "total revenue"}).json()
    assert body["results"][0]["total"] == 0


def test_run_is_recorded(client):
    h = signup(client)
    use(say("Nothing to calculate."))
    body = client.post(ASK, headers=h, json={"question": "hello analyst"}).json()
    with client.session_factory() as db:
        run = db.scalar(select(AgentRun))
        assert run.trace_id == body["trace_id"] and run.status == "completed" and run.conversation_id is None


def test_direct_query_endpoint(client):
    h = signup(client)
    seed(client, h)
    r = client.post(QUERY, headers=h, json={"metric": "deals", "period": "all_time"})
    assert r.status_code == 200 and r.json()["total"] == 2
    assert client.post(QUERY, headers=h, json={"metric": "revenue", "group_by": "status"}).status_code == 422
    assert client.post(QUERY, headers=h, json={"metric": "revenue", "sql": "x"}).status_code == 422
    assert client.post(QUERY, json={"metric": "deals"}).status_code in (401, 403)


def test_schema_endpoint(client):
    h = signup(client)
    body = client.get("/api/v1/analytics/schema", headers=h).json()
    assert {m["key"] for m in body["metrics"]} >= {"revenue", "conversion_rate"}


def test_chat_agent_gets_analytics_block(client):
    h = signup(client)
    seed(client, h)
    use(tool_call(("query_analytics", {"metric": "revenue", "period": "all_time"})), say("Revenue is INR 1,500."))
    msg = client.post(CHAT, headers=h, json={"message": "total revenue?"}).json()["assistant_message"]
    assert any(b["type"] == "analytics_result" for b in msg["blocks"])


def test_ask_requires_llm_config_message(client):
    h = signup(client)
    from app.main import app
    from app.services.llm import get_chat_llm

    app.dependency_overrides.pop(get_chat_llm, None)
    res = client.post(ASK, headers=h, json={"question": "revenue last month"})
    assert res.status_code == 503