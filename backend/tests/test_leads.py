from tests.conftest import login, signup

API = "/api/v1/leads"


def make_lead(client, headers, **overrides):
    body = {"name": "Asha Verma", "city": "Delhi", "priority": "high"} | overrides
    res = client.post(API, headers=headers, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_crud_flow(client):
    h = signup(client)
    lead = make_lead(client, h, email="asha@x.com", company="Verma Textiles")
    assert lead["status"] == "new"

    got = client.get(f"{API}/{lead['id']}", headers=h).json()
    assert got["company"] == "Verma Textiles"

    patched = client.patch(f"{API}/{lead['id']}", headers=h, json={"status": "qualified", "phone": ""})
    assert patched.status_code == 200
    assert patched.json()["status"] == "qualified"
    assert patched.json()["phone"] is None  # blank strings become null

    assert client.delete(f"{API}/{lead['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/{lead['id']}", headers=h).status_code == 404


def test_validation(client):
    h = signup(client)
    assert client.post(API, headers=h, json={"name": ""}).status_code == 422
    assert client.post(API, headers=h, json={"name": "A", "email": "not-an-email"}).status_code == 422
    assert client.post(API, headers=h, json={"name": "A", "status": "bogus"}).status_code == 422
    lead = make_lead(client, h)
    assert client.patch(f"{API}/{lead['id']}", headers=h, json={"name": None}).status_code == 422


def test_search_filter_sort_paginate(client):
    h = signup(client)
    make_lead(client, h, name="Anil", city="Delhi", priority="high", status="new")
    make_lead(client, h, name="Bina", city="Mumbai", priority="low", status="won")
    make_lead(client, h, name="Chirag", city="Delhi", priority="medium", status="contacted", company="Zeta Corp")

    def ids(**params):
        return [x["name"] for x in client.get(API, headers=h, params=params).json()["items"]]

    assert sorted(ids(city="delhi")) == ["Anil", "Chirag"]
    assert ids(priority="low") == ["Bina"]
    assert ids(status="won") == ["Bina"]
    assert ids(q="zeta") == ["Chirag"]
    assert ids(q="%") == []  # wildcard characters are treated literally
    assert ids(sort="priority", order="desc") == ["Anil", "Chirag", "Bina"]
    assert ids(sort="name", order="asc") == ["Anil", "Bina", "Chirag"]

    page2 = client.get(API, headers=h, params={"sort": "name", "order": "asc", "page": 2, "page_size": 2}).json()
    assert page2["total"] == 3
    assert [x["name"] for x in page2["items"]] == ["Chirag"]

    assert client.get(f"{API}/cities", headers=h).json() == ["Delhi", "Mumbai"]


def test_bulk_actions(client):
    h = signup(client)
    a, b, c = (make_lead(client, h, name=n) for n in ("A", "B", "C"))
    res = client.post(f"{API}/bulk-update", headers=h, json={"ids": [a["id"], b["id"]], "status": "contacted"})
    assert res.json() == {"updated": 2}
    assert client.get(f"{API}/{a['id']}", headers=h).json()["status"] == "contacted"
    assert client.post(f"{API}/bulk-update", headers=h, json={"ids": [a["id"]]}).status_code == 422

    res = client.post(f"{API}/bulk-delete", headers=h, json={"ids": [a["id"], c["id"]]})
    assert res.json() == {"deleted": 2}
    assert client.get(API, headers=h).json()["total"] == 1


def test_activity_timeline(client):
    h = signup(client, name="Olivia Owner")
    lead = make_lead(client, h)
    client.patch(f"{API}/{lead['id']}", headers=h, json={"priority": "low"})
    events = client.get(f"{API}/{lead['id']}/activity", headers=h).json()
    assert [e["action"] for e in events] == ["lead.updated", "lead.created"]
    assert events[0]["details"]["changed"]["priority"] == ["high", "low"]
    assert events[0]["actor_name"] == "Olivia Owner"


def test_organization_isolation(client):
    a = signup(client, email="a@one.com", org="One")
    b = signup(client, email="b@two.com", org="Two")
    lead = make_lead(client, a, name="Secret Lead", city="Delhi")

    # B can't see, read, change, delete or inspect A's lead
    assert client.get(API, headers=b).json()["total"] == 0
    assert client.get(f"{API}/cities", headers=b).json() == []
    assert client.get(f"{API}/{lead['id']}", headers=b).status_code == 404
    assert client.patch(f"{API}/{lead['id']}", headers=b, json={"name": "Hacked"}).status_code == 404
    assert client.delete(f"{API}/{lead['id']}", headers=b).status_code == 404
    assert client.get(f"{API}/{lead['id']}/activity", headers=b).status_code == 404
    assert client.post(f"{API}/bulk-delete", headers=b, json={"ids": [lead["id"]]}).json() == {"deleted": 0}
    assert client.post(f"{API}/bulk-update", headers=b, json={"ids": [lead["id"]], "status": "lost"}).json() == {"updated": 0}

    # still intact for A
    still = client.get(f"{API}/{lead['id']}", headers=a).json()
    assert still["name"] == "Secret Lead"

    # an organization_id in the request body is ignored, not trusted
    other_org = client.get("/api/v1/auth/me", headers=b).json()["organization"]["id"]
    mine = make_lead(client, a, name="Mine", organization_id=other_org)
    assert client.get(f"{API}/{mine['id']}", headers=b).status_code == 404

    # B's user can't be assigned to A's lead
    b_id = client.get("/api/v1/auth/me", headers=b).json()["id"]
    res = client.post(API, headers=a, json={"name": "X", "assigned_to": b_id})
    assert res.status_code == 422


def test_employee_cannot_delete(client):
    owner = signup(client)
    client.post(
        "/api/v1/team",
        headers=owner,
        json={"email": "emp@acme.com", "full_name": "Eve", "password": "supersecret1", "role": "employee"},
    )
    employee = login(client, "emp@acme.com", "supersecret1")
    lead = make_lead(client, employee)  # employees can create...
    assert client.patch(f"{API}/{lead['id']}", headers=employee, json={"status": "contacted"}).status_code == 200  # ...and edit
    assert client.delete(f"{API}/{lead['id']}", headers=employee).status_code == 403  # but not delete
    assert client.post(f"{API}/bulk-delete", headers=employee, json={"ids": [lead["id"]]}).status_code == 403
    assert client.delete(f"{API}/{lead['id']}", headers=owner).status_code == 204
