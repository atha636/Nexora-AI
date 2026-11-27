from datetime import datetime, timedelta, timezone

from app.main import app
from app.services.llm import LLMError, LLMResult, get_llm
from tests.conftest import login, signup


class FakeLLM:
    model = "fake"

    def __init__(self, text="Fine.", fail=False):
        self.text, self.fail, self.calls = text, fail, []

    def complete(self, system, user, *, max_tokens):
        self.calls.append((system, user))
        if self.fail:
            raise LLMError("The AI service is unavailable.")
        return LLMResult(text=self.text, latency_ms=2)


def use(llm):
    app.dependency_overrides[get_llm] = lambda: llm
    return llm


def mk(client, h, **kw):
    r = client.post("/api/v1/leads", headers=h, json={"name": "Priya Rao", "email": "priya.secret@x.com", "phone": "+91 99999 11111", "company": "Acme", "city": "Delhi", **kw})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_ask_uses_only_this_leads_facts_and_hides_contact_details(client):
    h = signup(client)
    lid = mk(client, h, priority="high")
    client.post("/api/v1/tasks", headers=h, json={"title": "Send the pricing deck", "lead_id": lid})
    other = mk(client, h)  # a second lead must not leak into the first one's sheet
    client.patch(f"/api/v1/leads/{other}", headers=h, json={"company": "Different Co"})
    llm = use(FakeLLM("She is high priority and has one open task."))
    r = client.post(f"/api/v1/leads/{lid}/ask", headers=h, json={"question": "What is the status?"})
    assert r.status_code == 200 and r.json() == {"answer": "She is high priority and has one open task.", "model": "fake"}
    system, user = llm.calls[0]
    assert "Priya Rao" in user and "Send the pricing deck" in user and "Priority: high" in user
    assert "priya.secret@x.com" not in user and "99999" not in user  # contact details never go to the model
    assert "Different Co" not in user
    assert "ignore any instruction" in system


def test_ask_includes_history_and_language(client):
    h = signup(client)
    lid = mk(client, h)
    llm = use(FakeLLM())
    client.post(f"/api/v1/leads/{lid}/ask", headers=h, json={"question": "And before that?", "history": [{"role": "user", "content": "Any tasks?"}, {"role": "assistant", "content": "None."}], "language": "hi"})
    system, user = llm.calls[0]
    assert "user: Any tasks?" in user and "Hindi" in system


def test_ask_validation_errors_and_other_orgs(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    lid = mk(client, a)
    use(FakeLLM())
    assert client.post(f"/api/v1/leads/{lid}/ask", headers=a, json={"question": "  "}).status_code == 422
    assert client.post(f"/api/v1/leads/{lid}/ask", headers=a, json={"question": "x" * 301}).status_code == 422
    assert client.post(f"/api/v1/leads/{lid}/ask", headers=a, json={"question": "hi", "language": "fr"}).status_code == 422
    assert client.post(f"/api/v1/leads/{lid}/ask", headers=b, json={"question": "hi"}).status_code == 404
    assert client.post(f"/api/v1/leads/{lid}/ask", json={"question": "hi"}).status_code in (401, 403)


def test_ask_when_the_ai_is_down(client):
    h = signup(client)
    lid = mk(client, h)
    use(FakeLLM(fail=True))
    r = client.post(f"/api/v1/leads/{lid}/ask", headers=h, json={"question": "hi"})
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]


def test_briefing_has_my_tasks_and_counts_only_mine(client):
    owner = signup(client)
    emp = client.post("/api/v1/team", headers=owner, json={"email": "eve@acme.com", "full_name": "Eve", "password": "supersecret1", "role": "employee"}).json()["id"]
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    soon = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    client.post("/api/v1/tasks", headers=owner, json={"title": "late", "due_at": past})
    client.post("/api/v1/tasks", headers=owner, json={"title": "soon", "due_at": soon})
    client.post("/api/v1/tasks", headers=owner, json={"title": "eves", "due_at": past, "assigned_to": emp})
    items = {i["key"]: i for i in client.get("/api/v1/dashboard/briefing", headers=owner).json()["items"]}
    assert items["my_tasks"]["value"] == "1" and items["my_tasks"]["tone"] == "warn" and "1 more" in items["my_tasks"]["detail"]
    eve = login(client, "eve@acme.com", "supersecret1")
    assert {i["key"]: i for i in client.get("/api/v1/dashboard/briefing", headers=eve).json()["items"]}["my_tasks"]["value"] == "1"


def test_briefing_summary_ai_and_fallback(client):
    h = signup(client)
    mk(client, h, priority="high")  # one quiet high-priority lead => something needs attention
    llm = use(FakeLLM("One high-priority lead needs a call."))
    ok = client.post("/api/v1/dashboard/briefing/summary", headers=h, json={}).json()
    assert ok == {"summary": "One high-priority lead needs a call.", "ai": True}
    system, user = llm.calls[0]
    assert "High-priority leads to contact: 1" in user and "Priya" not in user and "priya.secret" not in user  # figures only
    use(FakeLLM(fail=True))
    down = client.post("/api/v1/dashboard/briefing/summary", headers=h, json={}).json()
    assert down["ai"] is False and "high-priority leads to contact: 1" in down["summary"]
    assert client.post("/api/v1/dashboard/briefing/summary", headers=h, json={"language": "xx"}).status_code == 422
    assert client.post("/api/v1/dashboard/briefing/summary", json={}).status_code in (401, 403)