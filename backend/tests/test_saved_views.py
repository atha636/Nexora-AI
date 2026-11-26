from datetime import datetime, timedelta, timezone

from tests.conftest import login, signup


def hire(client, owner, email, role="employee"):
    r = client.post("/api/v1/team", headers=owner, json={"email": email, "full_name": email.split("@")[0].title(), "password": "supersecret1", "role": role})
    assert r.status_code == 201, r.text
    return r.json()["id"], login(client, email, "supersecret1")


def test_create_list_update_delete(client):
    h = signup(client)
    r = client.post("/api/v1/views", headers=h, json={"name": "  Hot Delhi ", "filters": {"city": "Delhi", "priority": "high"}})
    assert r.status_code == 201 and r.json()["name"] == "Hot Delhi" and r.json()["mine"] is True
    vid = r.json()["id"]
    assert client.get("/api/v1/views", headers=h).json()[0]["filters"] == {"city": "Delhi", "priority": "high"}
    up = client.patch(f"/api/v1/views/{vid}", headers=h, json={"name": "Hot", "filters": {"stale_days": 7}})
    assert up.json()["name"] == "Hot" and up.json()["filters"] == {"stale_days": 7}
    assert client.delete(f"/api/v1/views/{vid}", headers=h).status_code == 204
    assert client.get("/api/v1/views", headers=h).json() == []


def test_only_known_filters_are_accepted(client):
    h = signup(client)
    assert client.post("/api/v1/views", headers=h, json={"name": "x", "filters": {"sql": "drop table leads"}}).status_code == 422
    assert client.post("/api/v1/views", headers=h, json={"name": "x", "filters": {"priority": "urgent"}}).status_code == 422
    assert client.post("/api/v1/views", headers=h, json={"name": "  ", "filters": {}}).status_code == 422


def test_sharing_rules(client):
    owner = signup(client)
    _, emp = hire(client, owner, "eve@acme.com")
    _, mgr = hire(client, owner, "mo@acme.com", "manager")
    assert client.post("/api/v1/views", headers=emp, json={"name": "A", "filters": {}, "shared": True}).status_code == 403
    mine = client.post("/api/v1/views", headers=emp, json={"name": "Private", "filters": {}}).json()["id"]
    team = client.post("/api/v1/views", headers=mgr, json={"name": "Team", "filters": {"priority": "high"}, "shared": True}).json()["id"]
    assert [v["name"] for v in client.get("/api/v1/views", headers=emp).json()] == ["Team", "Private"]
    assert [v["name"] for v in client.get("/api/v1/views", headers=mgr).json()] == ["Team"]  # private ones stay private
    assert client.patch(f"/api/v1/views/{mine}", headers=mgr, json={"name": "x"}).status_code == 404
    assert client.patch(f"/api/v1/views/{team}", headers=emp, json={"name": "x"}).status_code == 403
    assert client.delete(f"/api/v1/views/{team}", headers=emp).status_code == 403
    assert client.patch(f"/api/v1/views/{mine}", headers=emp, json={"shared": True}).status_code == 403


def test_other_organizations_get_404_and_empty_lists(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    vid = client.post("/api/v1/views", headers=a, json={"name": "Mine", "filters": {}, "shared": True}).json()["id"]
    assert client.get("/api/v1/views", headers=b).json() == []
    assert client.patch(f"/api/v1/views/{vid}", headers=b, json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/v1/views/{vid}", headers=b).status_code == 404


def test_view_cap(client):
    h = signup(client)
    for i in range(20):
        assert client.post("/api/v1/views", headers=h, json={"name": f"v{i}", "filters": {}}).status_code == 201
    assert client.post("/api/v1/views", headers=h, json={"name": "one more", "filters": {}}).status_code == 422


def test_smart_filters_on_leads(client):
    owner = signup(client)
    emp_id, emp = hire(client, owner, "eve@acme.com")
    old = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    fresh = datetime.now(timezone.utc).isoformat()
    mk = lambda n, **kw: client.post("/api/v1/leads", headers=owner, json={"name": n, "email": f"{n}@x.com", **kw}).json()["id"]
    mk("Never")
    mk("Old", last_contacted_at=old)
    mk("Fresh", last_contacted_at=fresh, assigned_to=emp_id)
    names = lambda qs, h=owner: sorted(x["name"] for x in client.get(f"/api/v1/leads?{qs}", headers=h).json()["items"])
    assert names("stale_days=7") == ["Never", "Old"]
    assert names("assigned=none") == ["Never", "Old"]
    assert names("assigned=me", emp) == ["Fresh"]
    assert names("created_days=1") == ["Fresh", "Never", "Old"]
    assert client.get("/api/v1/leads?stale_days=0", headers=owner).status_code == 422
    assert client.get("/api/v1/leads?assigned=someone", headers=owner).status_code == 422