import csv
import io
from datetime import datetime, timedelta, timezone

from tests.conftest import login, signup


def hire(client, owner, email, role="employee"):
    r = client.post("/api/v1/team", headers=owner, json={"email": email, "full_name": email.split("@")[0].title(), "password": "supersecret1", "role": role})
    assert r.status_code == 201, r.text
    return login(client, email, "supersecret1")


def lead(client, h, **kw):
    r = client.post("/api/v1/leads", headers=h, json={"name": "Priya", "email": "p@x.com", "city": "Delhi", **kw})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def rows(resp):
    assert resp.status_code == 200, resp.text
    assert resp.text.startswith("﻿")
    return list(csv.reader(io.StringIO(resp.text.lstrip("﻿"))))


def test_summary_figures_cover_only_the_period(client, db_session=None):
    h = signup(client)
    a = lead(client, h, name="A", status="won")
    lead(client, h, name="B")
    s = client.get("/api/v1/reports/summary?months=3", headers=h).json()
    assert s["period"]["new_leads"] == 2 and s["period"]["won_of_new"] == 1 and s["period"]["conversion_rate"] == 50.0
    assert s["months"] == 3 and len(s["monthly_revenue"]) == 3 and s["period_start"] <= s["period_end"]
    assert s["organization"] and s["tasks"] == {"open": 0, "overdue": 0, "completed_in_period": 0}
    assert s["period"]["revenue"] == 0 and s["period"]["average_deal"] == 0
    assert {x["label"] for x in s["leads_by_status"]} >= {"won", "new"}
    assert a


def test_summary_tasks_and_validation(client):
    h = signup(client)
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client.post("/api/v1/tasks", headers=h, json={"title": "late", "due_at": past})
    done = client.post("/api/v1/tasks", headers=h, json={"title": "done"}).json()["id"]
    client.patch(f"/api/v1/tasks/{done}", headers=h, json={"status": "done"})
    t = client.get("/api/v1/reports/summary", headers=h).json()["tasks"]
    assert t == {"open": 1, "overdue": 1, "completed_in_period": 1}
    assert client.get("/api/v1/reports/summary?months=0", headers=h).status_code == 422
    assert client.get("/api/v1/reports/summary?months=25", headers=h).status_code == 422
    assert client.get("/api/v1/reports/summary").status_code in (401, 403)


def test_summary_is_organization_scoped(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    lead(client, a)
    assert client.get("/api/v1/reports/summary", headers=b).json()["period"]["new_leads"] == 0


def test_leads_csv_filters_and_neutralizes_formulas(client):
    h = signup(client)
    lead(client, h, name="=HYPERLINK(\"http://evil\")", priority="high")
    lead(client, h, name="+91 Sharma", priority="low", city="Pune")
    lead(client, h, name="Normal, Name", priority="high")
    out = rows(client.get("/api/v1/reports/leads.csv", headers=h))
    assert out[0][:3] == ["Name", "Email", "Phone"] and len(out) == 4
    names = {r[0] for r in out[1:]}
    assert "'=HYPERLINK(\"http://evil\")" in names and "'+91 Sharma" in names and "Normal, Name" in names
    assert len(rows(client.get("/api/v1/reports/leads.csv?priority=high", headers=h))) == 3
    assert len(rows(client.get("/api/v1/reports/leads.csv?city=pune", headers=h))) == 2
    assert client.get("/api/v1/reports/leads.csv?priority=urgent", headers=h).status_code == 422


def test_exports_need_manager_and_are_logged(client):
    owner = signup(client)
    emp = hire(client, owner, "eve@acme.com")
    mgr = hire(client, owner, "mo@acme.com", "manager")
    lead(client, owner)
    for path in ("leads.csv", "sales.csv"):
        assert client.get(f"/api/v1/reports/{path}", headers=emp).status_code == 403
        assert client.get(f"/api/v1/reports/{path}", headers=mgr).status_code == 200
    assert client.get("/api/v1/reports/summary", headers=emp).status_code == 200  # figures are open to everyone
    page = client.get("/api/v1/activity", headers=owner)
    assert page.status_code == 200
    assert any("export" in str(a).lower() for a in page.json()["items"])


def test_exports_never_include_other_organizations(client):
    a = signup(client, "a@a.com", "A")
    b = signup(client, "b@b.com", "B")
    lead(client, a, name="Secret Lead")
    assert len(rows(client.get("/api/v1/reports/leads.csv", headers=b))) == 1  # header only
    assert len(rows(client.get("/api/v1/reports/sales.csv", headers=b))) == 1


def test_sales_figures_and_csv(client):
    h = signup(client)
    lid = lead(client, h, name="Buyer")
    when = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    for amount in (1000, 3000):
        assert client.post("/api/v1/sales", headers=h, json={"amount": amount, "sold_at": when, "lead_id": lid}).status_code == 201
    p = client.get("/api/v1/reports/summary?months=1", headers=h).json()["period"]
    assert p["revenue"] == 4000 and p["deals"] == 2 and p["average_deal"] == 2000
    out = rows(client.get("/api/v1/reports/sales.csv?months=1", headers=h))
    assert out[0] == ["Sold on", "Amount", "Lead", "City", "Salesperson"] and len(out) == 3
    assert sorted(r[1] for r in out[1:]) == ["1000.00", "3000.00"] and out[1][2] == "Buyer"