"""Notifications: who is told what, privacy between people and organizations, and read state."""

from tests.conftest import signup
from tests.test_documents import team_member, upload, upload_ok
from tests.test_emails import APPROVALS, ask, make_draft, spy, use_llm  # noqa: F401 (spy is a fixture)
from tests.test_workflows import llm  # noqa: F401 (a fixture)

NOTES = "/api/v1/notifications"


def feed(client, h, **params):
    res = client.get(NOTES, headers=h, params=params)
    assert res.status_code == 200, res.text
    return res.json()


def kinds(client, h):
    return [n["kind"] for n in feed(client, h)["items"]]


def test_empty_feed_and_auth_required(client):
    h = signup(client)
    assert feed(client, h) == {"items": [], "unread": 0}
    assert client.get(NOTES).status_code == 401


def test_managers_are_told_about_new_approvals_but_not_the_requester(client, spy):
    owner = signup(client)
    mgr = team_member(client, owner, "manager", "mgr@acme.com")
    emp = team_member(client, owner, "employee", "emp@acme.com")
    use_llm()
    d, _ = make_draft(client, emp)
    ask(client, emp, d)
    assert "approval.requested" in kinds(client, mgr)
    assert "approval.requested" in kinds(client, owner)
    assert kinds(client, emp) == []  # the requester is not told about their own request
    note = feed(client, mgr)["items"][0]
    assert note["link"] == "/approvals" and "Priya" in note["body"] and note["read_at"] is None


def test_requester_hears_about_approval_and_rejection(client, spy):
    owner = signup(client)
    mgr = team_member(client, owner, "manager", "mgr@acme.com")
    emp = team_member(client, owner, "employee", "emp@acme.com")
    use_llm()
    d1, _ = make_draft(client, emp)
    a1 = ask(client, emp, d1).json()
    assert client.post(f"{APPROVALS}/{a1['id']}/approve", headers=mgr, json={}).status_code == 200
    assert "approval.approved" in kinds(client, emp)

    d2, _ = make_draft(client, emp)
    a2 = ask(client, emp, d2).json()
    client.post(f"{APPROVALS}/{a2['id']}/reject", headers=mgr, json={"note": "Wrong tone"})
    items = feed(client, emp)["items"]
    rejected = [n for n in items if n["kind"] == "approval.rejected"]
    assert rejected and rejected[0]["body"] == "Wrong tone"
    assert "approval.approved" not in kinds(client, mgr) and "approval.rejected" not in kinds(client, mgr)  # no self-notice


def test_deciding_your_own_request_does_not_notify_you(client, spy):
    owner = signup(client)
    use_llm()
    d, _ = make_draft(client, owner)
    a = ask(client, owner, d).json()
    client.post(f"{APPROVALS}/{a['id']}/approve", headers=owner, json={})
    assert feed(client, owner)["items"] == []


def test_failed_send_is_reported(client, spy):
    owner = signup(client)
    mgr = team_member(client, owner, "manager", "mgr@acme.com")
    emp = team_member(client, owner, "employee", "emp@acme.com")
    use_llm()
    spy.fail = True
    d, _ = make_draft(client, emp)
    a = ask(client, emp, d).json()
    client.post(f"{APPROVALS}/{a['id']}/approve", headers=mgr, json={})
    assert "approval.failed" in kinds(client, emp)


def test_document_ready_and_failed(client):
    h = signup(client)
    ok = upload_ok(client, h, "policy.txt", b"Refunds are issued within 14 days of purchase by the shop.")
    assert ok["status"] == "ready"
    bad = upload(client, h, "empty.txt", b"   \n  ")
    items = feed(client, h)["items"]
    got = {n["kind"]: n for n in items}
    assert "document.ready" in got and "policy.txt" in got["document.ready"]["title"]
    assert bad.status_code == 202 and "document.failed" in got
    assert got["document.ready"]["link"] == "/knowledge"


def test_mark_read_one_and_all(client, spy):
    owner = signup(client)
    emp = team_member(client, owner, "employee", "emp@acme.com")
    use_llm()
    for _ in range(2):
        d, _ = make_draft(client, emp)
        ask(client, emp, d)
    data = feed(client, owner)
    assert data["unread"] == 2
    first = data["items"][0]["id"]
    one = client.post(f"{NOTES}/{first}/read", headers=owner)
    assert one.status_code == 200 and one.json()["read_at"]
    assert feed(client, owner)["unread"] == 1
    assert len(feed(client, owner, unread_only=True)["items"]) == 1
    assert client.post(f"{NOTES}/read-all", headers=owner).json() == {"marked": 1}
    assert feed(client, owner)["unread"] == 0


def test_notifications_are_private_to_the_person_and_the_organization(client, spy):
    owner = signup(client)
    mgr = team_member(client, owner, "manager", "mgr@acme.com")
    emp = team_member(client, owner, "employee", "emp@acme.com")
    use_llm()
    d, _ = make_draft(client, emp)
    ask(client, emp, d)
    note_id = feed(client, mgr)["items"][0]["id"]
    # a colleague can't read or mark someone else's notification (it looks like it doesn't exist)
    assert client.post(f"{NOTES}/{note_id}/read", headers=owner).status_code == 404
    other_org = signup(client, "b@o.com", "Other", "Bob")
    assert client.post(f"{NOTES}/{note_id}/read", headers=other_org).status_code == 404
    assert feed(client, other_org)["items"] == []
    assert feed(client, mgr)["items"][0]["read_at"] is None  # the failed attempts changed nothing


def test_workflow_finished_by_someone_else_notifies_the_starter(client, llm, spy):
    from tests.test_workflows import lead_hi, make_wf, run

    owner = signup(client)
    mgr = team_member(client, owner, "manager", "mgr@acme.com")
    ex = run(client, mgr, make_wf(client, owner), lead_hi(client, owner)).json()
    assert ex["status"] == "waiting_approval"
    assert kinds(client, mgr) == []  # still waiting: nothing to report yet
    assert "approval.requested" in kinds(client, owner)  # the approver is asked
    client.post(f"{APPROVALS}/{ex['context']['approval_id']}/approve", headers=owner, json={})
    got = kinds(client, mgr)
    assert got == ["workflow.completed"]  # told once, not also "your email was approved"
    assert "Priya" in feed(client, mgr)["items"][0]["body"]


def test_failed_workflow_run_always_notifies(client):
    from tests.test_workflows import FlakyLLM, lead_hi, make_wf, run
    from app.main import app
    from app.services.llm import get_chat_llm

    app.dependency_overrides[get_chat_llm] = lambda: FlakyLLM(2)
    owner = signup(client)
    ex = run(client, owner, make_wf(client, owner), lead_hi(client, owner)).json()
    assert ex["status"] == "failed"
    items = feed(client, owner)["items"]
    failed = [n for n in items if n["kind"] == "workflow.failed"]
    assert failed and failed[0]["link"] == "/workflows" and "busy" in failed[0]["body"]


def test_old_notifications_are_pruned(client):
    from sqlalchemy import func, select

    from app.db.models import Notification, Profile
    from app.services import notify as svc

    h = signup(client)
    with client.session_factory() as db:
        user = db.scalar(select(Profile))
        org = client.get("/api/v1/auth/me", headers=h).json()["organization"]["id"]
        import uuid

        for i in range(svc.KEEP_PER_USER + 15):
            svc.notify(db, uuid.UUID(org), [user.id], kind="document.ready", title=f"n{i}")
        db.commit()
        svc.prune(db, uuid.UUID(org), user.id)
        db.commit()
        assert db.scalar(select(func.count()).select_from(Notification)) == svc.KEEP_PER_USER