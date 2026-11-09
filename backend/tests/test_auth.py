from tests.conftest import login, signup


def test_signup_then_me_shows_owner(client):
    headers = signup(client)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["email"] == "owner@acme.com"
    assert me["role"] == "owner"
    assert me["organization"]["name"] == "Acme"


def test_duplicate_email_rejected(client):
    signup(client)
    res = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "OWNER@acme.com",
            "password": "supersecret1",
            "full_name": "Dup",
            "organization_name": "Other",
        },
    )
    assert res.status_code == 409


def test_weak_password_rejected(client):
    res = client.post(
        "/api/v1/auth/signup",
        json={"email": "a@b.com", "password": "short", "full_name": "A", "organization_name": "B"},
    )
    assert res.status_code == 422


def test_login_success_and_failures(client):
    signup(client)
    assert login(client, "owner@acme.com", "supersecret1")
    bad = client.post("/api/v1/auth/login", json={"email": "owner@acme.com", "password": "wrong-pass"})
    ghost = client.post("/api/v1/auth/login", json={"email": "nobody@acme.com", "password": "wrong-pass"})
    assert bad.status_code == ghost.status_code == 401
    assert bad.json() == ghost.json()  # no hint about which emails exist


def test_protected_routes_need_a_valid_token(client):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/leads").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_logout(client):
    headers = signup(client)
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 200


def test_team_roles(client):
    owner = signup(client)
    res = client.post(
        "/api/v1/team",
        headers=owner,
        json={"email": "emp@acme.com", "full_name": "Eve", "password": "supersecret1", "role": "employee"},
    )
    assert res.status_code == 201
    employee = login(client, "emp@acme.com", "supersecret1")

    # employees can see the team but not add people
    assert len(client.get("/api/v1/team", headers=employee).json()) == 2
    denied = client.post(
        "/api/v1/team",
        headers=employee,
        json={"email": "x@acme.com", "full_name": "X", "password": "supersecret1"},
    )
    assert denied.status_code == 403

    # nobody can mint an owner through the API
    owner_attempt = client.post(
        "/api/v1/team",
        headers=owner,
        json={"email": "y@acme.com", "full_name": "Y", "password": "supersecret1", "role": "owner"},
    )
    assert owner_attempt.status_code == 422
