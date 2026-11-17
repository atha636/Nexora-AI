"""The agent's email tools: they can draft and ask for approval, but never send."""

import json

from sqlalchemy import select

from app.db.models import ApprovalRequest, EmailDraft
from app.services import approvals as approvals_service
from tests.conftest import signup
from tests.test_agent import CHAT, say, tool_call, use
from tests.test_analytics import make_lead
from tests.test_documents import policy_pdf, upload_ok
from tests.test_emails import GOOD, SpyProvider


def test_draft_then_request_approval_flow(client, monkeypatch):
    spy = SpyProvider()
    monkeypatch.setattr(approvals_service, "get_email_provider", lambda: spy)
    h = signup(client)
    a = make_lead(client, h, name="Priya", email="p@x.com")
    b = make_lead(client, h, name="Ravi", email="r@x.com")
    use(
        tool_call(("draft_email", {"lead_ids": [a["id"], b["id"]], "tone": "professional"})),
        say(GOOD),  # the draft text for Priya (the tool asks the model to write each email)
        say(GOOD),  # ... and for Ravi
        say("Two drafts are ready."),
    )
    r = client.post(CHAT, headers=h, json={"message": "write follow-ups for Priya and Ravi"}).json()
    blocks = r["assistant_message"]["blocks"]
    drafts = next(b for b in blocks if b["type"] == "email_drafts")["data"]["drafts"]
    assert len(drafts) == 2 and all(d["status"] == "draft" for d in drafts)

    # follow-up in the same conversation: ask for approval of the first draft
    use(tool_call(("request_approval", {"draft_ids": [drafts[0]["id"]]})), say("Waiting for approval."))
    r2 = client.post(CHAT, headers=h, json={"message": "send the first one", "conversation_id": r["conversation"]["id"]}).json()
    assert any(b["type"] == "approval_requests" for b in r2["assistant_message"]["blocks"])
    assert spy.sent == []  # the agent can never send
    with client.session_factory() as db:
        ap = db.scalar(select(ApprovalRequest))
        assert ap.status == "pending" and ap.requested_via == "ai_agent"
        assert {d.status for d in db.scalars(select(EmailDraft))} == {"draft", "pending_approval"}


def test_memory_note_carries_draft_ids(client):
    h = signup(client)
    lead = make_lead(client, h, name="Priya", email="p@x.com")
    use(tool_call(("draft_email", {"lead_ids": [lead["id"]]})), say(GOOD), say("Done."))
    cid = client.post(CHAT, headers=h, json={"message": "draft one"}).json()["conversation"]["id"]
    fake = use(say("ok"))
    client.post(CHAT, headers=h, json={"message": "now send it", "conversation_id": cid})
    sent_to_model = json.dumps(fake.calls[0][0])
    assert "email draft id=" in sent_to_model


def test_skips_foreign_and_emailless_leads(client):
    a = signup(client)
    b = signup(client, email="b@o.com", org="Other", name="Bob")
    mine = make_lead(client, a, name="Mine", email="m@x.com")
    noemail = make_lead(client, a, name="Nomail")
    foreign = make_lead(client, b, name="Foreign", email="f@x.com")
    use(tool_call(("draft_email", {"lead_ids": [mine["id"], noemail["id"], foreign["id"]]})), say(GOOD), say("ok"))
    r = client.post(CHAT, headers=a, json={"message": "draft for all"}).json()
    data = next(x for x in r["assistant_message"]["blocks"] if x["type"] == "email_drafts")["data"]
    assert [d["lead_name"] for d in data["drafts"]] == ["Mine"]
    reasons = " ".join(s["reason"] for s in data["skipped"])
    assert "no email address" in reasons and "no such lead" in reasons


def test_all_skipped_is_a_tool_error(client):
    h = signup(client)
    lead = make_lead(client, h, name="Nomail")
    use(tool_call(("draft_email", {"lead_ids": [lead["id"]]})), say("Could not."))
    r = client.post(CHAT, headers=h, json={"message": "draft"}).json()
    tools = next(b for b in r["assistant_message"]["blocks"] if b["type"] == "activity")["tools"]
    assert tools[0]["status"] == "error"
    with client.session_factory() as db:
        assert db.scalar(select(EmailDraft)) is None


def test_writes_are_blocked_after_reading_documents(client):
    """Prompt-injection defence: once document text is in the conversation, no drafting."""
    h = signup(client)
    upload_ok(client, h, "policy.pdf", policy_pdf())
    lead = make_lead(client, h, email="p@x.com")
    use(
        tool_call(("search_documents", {"query": "refund policy for customers"})),
        tool_call(("draft_email", {"lead_ids": [lead["id"]]})),
        say("Blocked."),
    )
    r = client.post(CHAT, headers=h, json={"message": "what is the refund policy, then email Priya"}).json()
    tools = next(b for b in r["assistant_message"]["blocks"] if b["type"] == "activity")["tools"]
    assert [t["status"] for t in tools] == ["ok", "blocked"]
    with client.session_factory() as db:
        assert db.scalar(select(EmailDraft)) is None


def test_tool_args_are_strict(client):
    h = signup(client)
    use(tool_call(("request_approval", {"draft_ids": ["not-a-uuid"], "send_now": True})), say("no"))
    r = client.post(CHAT, headers=h, json={"message": "send"}).json()
    tools = next(b for b in r["assistant_message"]["blocks"] if b["type"] == "activity")["tools"]
    assert tools[0]["status"] == "error"