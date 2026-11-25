from datetime import datetime, timedelta, timezone

from tests.conftest import login, signup


def hire(client, owner, email, role="employee"):
    r = client.post("/api/v1/team", headers=owner, json={"email": email, "full_name": email.split("@")[0].title(), "password": "supersecret1", "role": role})
    assert r.status_code == 201, r.text
    return r.json()["id"], login(client, email, "supersecret1")


def iso(delta_hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=delta_hours)).isoformat()


def lead(client, h, name="Priya"):
    r = client.post("/api/v1/leads", headers=h, json={"name": name, "email": f"{name.lower()}@x.com"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_create_list_complete_and_delete(client):
    h = signup(client)
    lid = lead(client, h)
    t = client.post("/api/v1/tasks", headers=h, json={"title": "  Call Priya  ", "lead_id": lid, "due_at": iso(24)})
    assert t.status_code == 201 and t.json()["title"] == "Call Priya" and t.json()["lead_name"] == "Priya"
    tid = t.json()["id"]
    assert [x["id"] for x in client.get("/api/v1/tasks", headers=h).json()["items"]] == [tid]
    done = client.patch(f"/api/v1/tasks/{tid}", headers=h, json={"status": "done"}).json()
    assert done["status"] == "done" and done["completed_at"]
    assert client.get("/api/v1/tasks", headers=h).json()["total"] == 0
    assert client.get("/api/v1/tasks?state=done", headers=h).json()["total"] == 1
    actions = [a["action"] for a in client.get(f"/api/v1/leads/{lid}/activity", headers=h).json()]
    assert "task.created" in actions and "task.completed" in actions  # shown in the lead's timeline
    assert client.delete(f"/api/v1/tasks/{tid}", headers=h).status_code == 204
    assert client.get("/api/v1/tasks?state=all", headers=h).json()["total"] == 0


def test_validation(client):
    h = signup(client)
    assert client.post("/api/v1/tasks", headers=h, json={"title": "   "}).status_code == 422
    assert client.post("/api/v1/tasks", headers=h, json={"title": "x" * 201}).status_code == 422
    assert client.post("/api/v1/tasks", headers=h, json={"title": "x", "lead_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404


def test_overdue_and_summary_with_one_reminder(client):
    h = signup(client)
    client.post("/api/v1/tasks", headers=h, json={"title": "Late one", "due_at": iso(-2)})
    client.post("/api/v1/tasks", headers=h, json={"title": "Soon", "due_at": iso(5)})
    client.post("/api/v1/tasks", headers=h, json={"title": "Later", "due_at": iso(72)})
    items = client.get("/api/v1/tasks", headers=h).json()["items"]
    assert [i["title"] for i in items] == ["Late one", "Soon", "Later"] and items[0]["overdue"] and not items[1]["overdue"]
    s = client.get("/api/v1/tasks/summary", headers=h).json()
    assert s == {"open": 3, "overdue": 1, "due_soon": 1}
    client.get("/api/v1/tasks/summary", headers=h)  # asking again must not remind again
    due = [n for n in client.get("/api/v1/notifications", headers=h).json()["items"] if n["kind"] == "task.due"]
    assert len(due) == 1 and "Late one" in due[0]["title"]


def test_new_due_date_earns_a_new_reminder(client):
    h = signup(client)
    tid = client.post("/api/v1/tasks", headers=h, json={"title": "Chase", "due_at": iso(-1)}).json()["id"]
    client.get("/api/v1/tasks/summary", headers=h)
    client.patch(f"/api/v1/tasks/{tid}", headers=h, json={"due_at": iso(-0.5)})
    client.get("/api/v1/tasks/summary", headers=h)
    due = [n for n in client.get("/api/v1/notifications?limit=50", headers=h).json()["items"] if n["kind"] == "task.due"]
    assert len(due) == 2
    cleared = client.patch(f"/api/v1/tasks/{tid}", headers=h, json={"due_at": None}).json()
    assert cleared["due_at"] is None and not cleared["overdue"]


def test_assignment_rules(client):
    owner = signup(client)
    emp_id, emp = hire(client, owner, "eve@acme.com")
    mgr_id, mgr = hire(client, owner, "mo@acme.com", "manager")
    assert client.post("/api/v1/tasks", headers=emp, json={"title": "Nope", "assigned_to": mgr_id}).status_code == 403
    t = client.post("/api/v1/tasks", headers=mgr, json={"title": "Call back", "assigned_to": emp_id})
    assert t.status_code == 201 and t.json()["assigned_name"] == "Eve"
    assert [i["title"] for i in client.get("/api/v1/tasks", headers=emp).json()["items"]] == ["Call back"]
    assert client.get("/api/v1/tasks", headers=mgr).json()["total"] == 0  # "mine" means assigned to me
    assert client.get("/api/v1/tasks?scope=all", headers=mgr).json()["total"] == 1
    assert client.get("/api/v1/tasks?scope=all", headers=emp).status_code == 403
    assert any(n["kind"] == "task.assigned" for n in client.get("/api/v1/notifications", headers=emp).json()["items"])
    assert client.patch(f"/api/v1/tasks/{t.json()['id']}", headers=emp, json={"status": "done"}).status_code == 200  # assignee may finish it


def test_other_peoples_tasks_are_protected(client):
    owner = signup(client)
    _, a = hire(client, owner, "a@acme.com")
    _, b = hire(client, owner, "b@acme.com")
    tid = client.post("/api/v1/tasks", headers=a, json={"title": "Mine"}).json()["id"]
    assert client.patch(f"/api/v1/tasks/{tid}", headers=b, json={"title": "Hijack"}).status_code == 403
    assert client.delete(f"/api/v1/tasks/{tid}", headers=b).status_code == 403
    assert client.patch(f"/api/v1/tasks/{tid}", headers=owner, json={"title": "Edited by boss"}).status_code == 200


def test_other_organizations_get_404(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    lid = lead(client, a)
    tid = client.post("/api/v1/tasks", headers=a, json={"title": "Secret", "lead_id": lid}).json()["id"]
    assert client.patch(f"/api/v1/tasks/{tid}", headers=b, json={"status": "done"}).status_code == 404
    assert client.delete(f"/api/v1/tasks/{tid}", headers=b).status_code == 404
    assert client.get(f"/api/v1/tasks?lead_id={lid}", headers=b).status_code == 404
    assert client.post("/api/v1/tasks", headers=b, json={"title": "x", "lead_id": lid}).status_code == 404
    assert client.get("/api/v1/tasks?state=all", headers=b).json()["total"] == 0


def test_cannot_assign_to_a_stranger(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    stranger = client.get("/api/v1/auth/me", headers=b).json()["id"]
    assert client.post("/api/v1/tasks", headers=a, json={"title": "x", "assigned_to": stranger}).status_code == 404


def test_deleting_a_lead_removes_its_tasks(client):
    h = signup(client)
    lid = lead(client, h)
    client.post("/api/v1/tasks", headers=h, json={"title": "Follow up", "lead_id": lid})
    client.delete(f"/api/v1/leads/{lid}", headers=h)
    assert client.get("/api/v1/tasks?state=all", headers=h).json()["total"] == 0