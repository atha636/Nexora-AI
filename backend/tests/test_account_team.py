from tests.conftest import login, signup


def add(client, owner, email, role="employee"):
    r = client.post("/api/v1/team", headers=owner, json={"email": email, "full_name": "Pat", "password": "supersecret1", "role": role})
    assert r.status_code == 201, r.text
    return r.json()["id"], login(client, email, "supersecret1")


def test_owner_changes_and_removes_members(client):
    owner = signup(client)
    emp_id, emp = add(client, owner, "e@acme.com")
    r = client.patch(f"/api/v1/team/{emp_id}", headers=owner, json={"role": "manager"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    assert client.patch(f"/api/v1/team/{emp_id}", headers=owner, json={"role": "owner"}).status_code == 422
    assert client.delete(f"/api/v1/team/{emp_id}", headers=owner).status_code == 204
    assert client.get("/api/v1/auth/me", headers=emp).status_code == 403  # no longer a member
    assert all(m["id"] != emp_id for m in client.get("/api/v1/team", headers=owner).json())


def test_role_rules(client):
    owner = signup(client)
    me = client.get("/api/v1/auth/me", headers=owner).json()["id"]
    admin_id, admin = add(client, owner, "a@acme.com", "admin")
    emp_id, emp = add(client, owner, "e@acme.com")
    assert client.patch(f"/api/v1/team/{emp_id}", headers=emp, json={"role": "admin"}).status_code == 403  # employees can't
    assert client.patch(f"/api/v1/team/{emp_id}", headers=admin, json={"role": "admin"}).status_code == 403  # only owner makes admins
    assert client.patch(f"/api/v1/team/{me}", headers=admin, json={"role": "employee"}).status_code == 403  # owner is untouchable
    assert client.patch(f"/api/v1/team/{admin_id}", headers=admin, json={"role": "employee"}).status_code == 400  # not yourself
    assert client.delete(f"/api/v1/team/{admin_id}", headers=owner).status_code == 204


def test_other_organizations_members_are_404(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    other_id, _ = add(client, b, "x@b.com")
    assert client.patch(f"/api/v1/team/{other_id}", headers=a, json={"role": "manager"}).status_code == 404
    assert client.delete(f"/api/v1/team/{other_id}", headers=a).status_code == 404


def test_removing_a_member_unassigns_their_leads(client):
    owner = signup(client)
    emp_id, _ = add(client, owner, "e@acme.com")
    lead = client.post("/api/v1/leads", headers=owner, json={"name": "Priya", "email": "p@x.com", "assigned_to": emp_id}).json()
    client.delete(f"/api/v1/team/{emp_id}", headers=owner)
    assert client.get(f"/api/v1/leads/{lead['id']}", headers=owner).json()["assigned_to"] is None


def test_profile_password_and_org(client):
    owner = signup(client)
    assert client.patch("/api/v1/account/profile", headers=owner, json={"full_name": "  New Name "}).json()["full_name"] == "New Name"
    bad = client.post("/api/v1/account/password", headers=owner, json={"current_password": "nope", "new_password": "anotherpass1"})
    assert bad.status_code == 400
    ok = client.post("/api/v1/account/password", headers=owner, json={"current_password": "supersecret1", "new_password": "anotherpass1"})
    assert ok.status_code == 204
    assert client.post("/api/v1/auth/login", json={"email": "owner@acme.com", "password": "anotherpass1"}).status_code == 200
    assert client.patch("/api/v1/account/organization", headers=owner, json={"name": "Acme Inc"}).json()["organization"]["name"] == "Acme Inc"
    _, emp = add(client, owner, "e@acme.com")
    assert client.patch("/api/v1/account/organization", headers=emp, json={"name": "Hax"}).status_code == 403