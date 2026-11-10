from datetime import datetime, timedelta, timezone

from app.services.analytics import month_keys
from tests.conftest import login, signup

LEADS = "/api/v1/leads"
SALES = "/api/v1/sales"


def make_lead(client, h, **kw):
    res = client.post(LEADS, headers=h, json={"name": "Lead"} | kw)
    assert res.status_code == 201, res.text
    return res.json()


def record_sale(client, h, amount, days_ago=0, **kw):
    sold_at = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    res = client.post(SALES, headers=h, json={"amount": amount, "sold_at": sold_at} | kw)
    assert res.status_code == 201, res.text
    return res.json()


def me(client, h):
    return client.get("/api/v1/auth/me", headers=h).json()


# ---------- helpers ----------
def test_month_keys_cross_year_boundary():
    now = datetime(2026, 2, 15, tzinfo=timezone.utc)
    assert month_keys(4, now) == ["2025-11", "2025-12", "2026-01", "2026-02"]


# ---------- dashboard / KPIs ----------
def test_empty_org_returns_zeros_not_errors(client):
    h = signup(client)
    data = client.get("/api/v1/dashboard/overview", headers=h).json()
    assert data["kpis"] == {
        "total_leads": 0,
        "won_leads": 0,
        "total_revenue": 0.0,
        "conversion_rate": 0.0,
        "active_workflows": 0,
        "pending_approvals": 0,
        "documents_indexed": 0,
    }
    assert len(data["monthly_revenue"]) == 12  # empty months are still present
    assert data["leads_by_city"] == []
    # signing up already logged "workspace created"
    assert data["recent_activity"][0]["summary"] == "Workspace created"


def test_kpis_and_conversion(client):
    h = signup(client)
    make_lead(client, h, status="won")
    make_lead(client, h, status="won")
    make_lead(client, h, status="new")
    make_lead(client, h, status="lost")
    record_sale(client, h, 1000)
    record_sale(client, h, 2500.50)

    kpis = client.get("/api/v1/dashboard/overview", headers=h).json()["kpis"]
    assert kpis["total_leads"] == 4
    assert kpis["won_leads"] == 2
    assert kpis["conversion_rate"] == 50.0
    assert kpis["total_revenue"] == 3500.50


# ---------- revenue ----------
def test_monthly_revenue_buckets_and_window(client):
    h = signup(client)
    record_sale(client, h, 100, days_ago=0)
    record_sale(client, h, 50, days_ago=0)
    record_sale(client, h, 999, days_ago=400)  # outside a 12-month window

    data = client.get("/api/v1/analytics/revenue?months=12", headers=h).json()
    monthly = data["monthly"]
    assert len(monthly) == 12
    assert monthly[-1]["revenue"] == 150 and monthly[-1]["deals"] == 2
    assert sum(m["revenue"] for m in monthly) == 150
    assert data["total"] == 150

    short = client.get("/api/v1/analytics/revenue?months=3", headers=h).json()
    assert len(short["monthly"]) == 3


def test_revenue_by_city_uses_lead_city_and_keeps_orphans(client):
    h = signup(client)
    delhi = make_lead(client, h, city="Delhi")
    mumbai = make_lead(client, h, city="Mumbai")
    record_sale(client, h, 300, lead_id=delhi["id"])
    record_sale(client, h, 200, lead_id=delhi["id"])
    record_sale(client, h, 100, lead_id=mumbai["id"])
    record_sale(client, h, 40)  # no lead at all

    by_city = client.get("/api/v1/analytics/revenue", headers=h).json()["by_city"]
    assert [(c["label"], c["revenue"]) for c in by_city] == [("Delhi", 500), ("Mumbai", 100), ("Unknown", 40)]
    assert by_city[0]["deals"] == 2


def test_sales_performance_per_person(client):
    owner = signup(client)
    client.post(
        "/api/v1/team",
        headers=owner,
        json={"email": "eve@acme.com", "full_name": "Eve", "password": "supersecret1", "role": "employee"},
    )
    team = client.get("/api/v1/team", headers=owner).json()
    eve = next(m for m in team if m["email"] == "eve@acme.com")

    make_lead(client, owner, assigned_to=eve["id"], status="won")
    make_lead(client, owner, assigned_to=eve["id"], status="new")
    record_sale(client, owner, 700, salesperson_id=eve["id"])
    record_sale(client, owner, 100)  # credited to the owner

    perf = client.get("/api/v1/analytics/revenue", headers=owner).json()["by_salesperson"]
    assert [p["name"] for p in perf] == ["Eve", "Olivia Owner"]  # sorted by revenue
    assert perf[0]["revenue"] == 700 and perf[0]["deals"] == 1
    assert perf[0]["leads_assigned"] == 2 and perf[0]["leads_won"] == 1
    assert perf[0]["conversion_rate"] == 50.0
    assert perf[1]["conversion_rate"] == 0.0


# ---------- lead analytics ----------
def test_lead_analytics_breakdowns(client):
    h = signup(client)
    make_lead(client, h, city="Delhi", source="Website", status="won")
    make_lead(client, h, city="Delhi", source="Referral", status="new")
    make_lead(client, h, city="Pune", status="new")  # no source

    data = client.get("/api/v1/analytics/leads", headers=h).json()
    assert data["by_city"][0] == {"label": "Delhi", "count": 2}
    assert {s["label"]: s["count"] for s in data["by_status"]} == {"new": 2, "won": 1}
    assert {s["label"]: s["count"] for s in data["by_source"]} == {"Website": 1, "Referral": 1, "Unknown": 1}
    current = data["acquisition"][-1]
    assert current["created"] == 3 and current["won"] == 1 and current["conversion_rate"] == 33.3

    overview = client.get("/api/v1/analytics/overview", headers=h).json()
    assert overview["kpis"]["total_leads"] == 3


# ---------- security ----------
def test_analytics_are_isolated_between_organizations(client):
    a = signup(client, email="a@one.com", org="One")
    b = signup(client, email="b@two.com", org="Two")
    lead = make_lead(client, a, city="Delhi", status="won")
    record_sale(client, a, 5000, lead_id=lead["id"])

    for path in ("/dashboard/overview", "/analytics/overview", "/analytics/revenue", "/analytics/leads"):
        assert client.get(f"/api/v1{path}", headers=a).status_code == 200
    seen = client.get("/api/v1/dashboard/overview", headers=b).json()
    assert seen["kpis"]["total_leads"] == 0 and seen["kpis"]["total_revenue"] == 0
    assert seen["leads_by_city"] == []
    assert all(m["revenue"] == 0 for m in seen["monthly_revenue"])
    assert [p["name"] for p in seen["sales_performance"]] == ["Olivia Owner"]  # only B's own team
    assert client.get("/api/v1/analytics/revenue", headers=b).json()["by_city"] == []
    # B's activity feed only has B's events
    assert all(x["summary"] == "Workspace created" for x in seen["recent_activity"])


def test_endpoints_require_login_and_validate_months(client):
    for path in ("/dashboard/overview", "/analytics/overview", "/analytics/revenue", "/analytics/leads", "/sales"):
        assert client.get(f"/api/v1{path}").status_code == 401
    h = signup(client)
    assert client.get("/api/v1/analytics/revenue?months=0", headers=h).status_code == 422
    assert client.get("/api/v1/analytics/revenue?months=999", headers=h).status_code == 422
    assert client.get("/api/v1/analytics/revenue?months=abc", headers=h).status_code == 422


def test_employee_can_view_dashboard(client):
    owner = signup(client)
    client.post(
        "/api/v1/team",
        headers=owner,
        json={"email": "emp@acme.com", "full_name": "Eve", "password": "supersecret1", "role": "employee"},
    )
    employee = login(client, "emp@acme.com", "supersecret1")
    assert client.get("/api/v1/dashboard/overview", headers=employee).status_code == 200


# ---------- sales API validation ----------
def test_sale_validation(client):
    a = signup(client, email="a@one.com", org="One")
    b = signup(client, email="b@two.com", org="Two")
    foreign_lead = make_lead(client, b)
    foreign_user = me(client, b)["id"]

    for bad in (0, -5, 1e12):
        assert client.post(SALES, headers=a, json={"amount": bad}).status_code == 422
    assert client.post(SALES, headers=a, json={"amount": "lots"}).status_code == 422
    # can't attach a sale to another tenant's lead or credit another tenant's user
    assert client.post(SALES, headers=a, json={"amount": 10, "lead_id": foreign_lead["id"]}).status_code == 404
    assert client.post(SALES, headers=a, json={"amount": 10, "salesperson_id": foreign_user}).status_code == 422
    assert client.get(SALES, headers=a).json() == []