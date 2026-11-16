"""The analytics engine: periods, metrics, grouping, comparison, safety. "Today" is pinned."""

import uuid
from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.analyst import periods
from app.analyst.engine import run_query
from app.analyst.spec import AnalyticsError, AnalyticsQuery
from app.db.models import Lead, Organization, Profile, Sale
from tests.conftest import signup

NOW = date(2026, 11, 15)


def dt(y, m, d=10):
    return datetime(y, m, d, 12, tzinfo=timezone.utc)


def Q(**kw):
    return AnalyticsQuery(**kw)


@pytest.fixture
def world(client):
    """Org A with known data, plus an unrelated org B whose numbers must never leak in."""
    signup(client)
    signup(client, email="b@other.com", org="Other", name="Bob")
    with client.session_factory() as db:
        orgs = {o.name: o.id for o in db.query(Organization).all()}
        a, b = orgs["Acme"], orgs["Other"]
        asha = Profile(email="asha@x.com", full_name="Asha", password_hash="x")
        ravi = Profile(email="ravi@x.com", full_name="Ravi", password_hash="x")
        db.add_all([asha, ravi])
        db.flush()

        def lead(org, city, status="new", priority="medium", when=dt(2026, 10), who=None, source="web"):
            l = Lead(organization_id=org, name="L", city=city, status=status, priority=priority,
                     created_at=when, assigned_to=who, source=source)
            db.add(l)
            db.flush()
            return l

        d1, d2 = lead(a, "Delhi", "won", "high", who=asha.id), lead(a, "Delhi", "new", who=asha.id)
        m1 = lead(a, "Mumbai", "won", who=ravi.id, source="referral")
        lead(a, "Mumbai", "lost", when=dt(2026, 9), who=ravi.id)
        ob = lead(b, "Delhi", "won")

        def sale(org, amount, when, l=None, who=None):
            db.add(Sale(organization_id=org, lead_id=l.id if l else None, salesperson_id=who, amount=amount, sold_at=when))

        sale(a, 1000, dt(2026, 10, 5), d1, asha.id)
        sale(a, 500, dt(2026, 10, 20), d1, asha.id)
        sale(a, 2000, dt(2026, 10, 7), m1, ravi.id)
        sale(a, 3000, dt(2026, 9, 3), d1, asha.id)
        sale(a, 500, dt(2026, 9, 9), m1, ravi.id)
        sale(a, 700, dt(2026, 11, 2), d1, asha.id)
        sale(a, 400, dt(2026, 8, 1))  # no lead, no salesperson
        sale(b, 99999, dt(2026, 10, 5), ob)
        db.commit()
        return a


def go(client, org, **kw):
    with client.session_factory() as db:
        return run_query(db, org, Q(**kw), now=NOW)


# ---------- periods ----------
def test_period_presets():
    p = periods.resolve(Q(metric="revenue", period="last_month"), NOW)
    assert (p.start, p.end) == (date(2026, 10, 1), date(2026, 11, 1))
    assert periods.resolve(Q(metric="revenue", period="last_3_months"), NOW).start == date(2026, 8, 1)
    assert periods.resolve(Q(metric="revenue", period="last_year"), NOW).end == date(2026, 1, 1)
    assert periods.resolve(Q(metric="revenue", period="all_time"), NOW).start is None


def test_period_across_new_year():
    p = periods.resolve(Q(metric="revenue", period="last_month"), date(2026, 1, 9))
    assert (p.start, p.end) == (date(2025, 12, 1), date(2026, 1, 1))


def test_previous_period():
    p = periods.resolve(Q(metric="revenue", period="last_month"), NOW)
    assert periods.previous(p).start == date(2026, 9, 1)
    c = periods.resolve(Q(metric="revenue", start_date="2026-10-01", end_date="2026-10-10"), NOW)
    assert (periods.previous(c).start, periods.previous(c).end) == (date(2026, 9, 21), date(2026, 10, 1))


def test_bad_dates_rejected():
    with pytest.raises(ValidationError):
        Q(metric="revenue", period="last_month", start_date="2026-01-01", end_date="2026-02-01")
    with pytest.raises(ValidationError):
        Q(metric="revenue", start_date="2026-01-01")
    with pytest.raises(AnalyticsError):
        periods.resolve(Q(metric="revenue", start_date="2026-02-01", end_date="2026-01-01"), NOW)


# ---------- metrics ----------
def test_revenue_last_month_and_isolation(client, world):
    r = go(client, world, metric="revenue", period="last_month")
    assert r["total"] == 3500  # org B's 99999 never appears
    assert r["rows"] == [] and r["chart"] is None


def test_revenue_by_city_uses_lead_city(client, world):
    r = go(client, world, metric="revenue", group_by="city", period="last_3_months")
    got = {x["label"]: x["value"] for x in r["rows"]}
    assert got == {"Delhi": 4500, "Mumbai": 2500, "Unknown": 400}
    assert r["chart"]["type"] == "bar"
    assert r["rows"][0]["label"] == "Delhi"


def test_revenue_by_salesperson(client, world):
    r = go(client, world, metric="revenue", group_by="salesperson", period="last_month")
    assert {x["label"]: x["value"] for x in r["rows"]} == {"Asha": 1500, "Ravi": 2000}


def test_monthly_trend_fills_gaps(client, world):
    r = go(client, world, metric="revenue", group_by="month", period="last_3_months")
    assert [(x["label"], x["value"]) for x in r["rows"]] == [("2026-08", 400), ("2026-09", 3500), ("2026-10", 3500)]
    assert r["chart"]["type"] == "line"
    r = go(client, world, metric="revenue", group_by="month", period="last_6_months")
    assert len(r["rows"]) == 6 and r["rows"][0]["value"] == 0


def test_deals_and_average(client, world):
    assert go(client, world, metric="deals", period="last_month")["total"] == 3
    assert go(client, world, metric="avg_deal", period="last_month")["total"] == round(3500 / 3, 2)


def test_conversion_rate_by_salesperson(client, world):
    r = go(client, world, metric="conversion_rate", group_by="salesperson", period="last_month")
    got = {x["label"]: x["value"] for x in r["rows"]}
    assert got == {"Asha": 50.0, "Ravi": 100.0}
    assert r["total"] == round(100 * 2 / 3, 1)


def test_leads_and_won(client, world):
    assert go(client, world, metric="leads", period="last_month")["total"] == 3
    assert go(client, world, metric="won_leads", group_by="city", period="last_month")["rows"][0]["value"] == 1


def test_filters(client, world):
    assert go(client, world, metric="revenue", period="last_month", city="delhi")["total"] == 1500
    assert go(client, world, metric="revenue", period="last_month", salesperson="ravi")["total"] == 2000
    assert go(client, world, metric="leads", period="last_month", priority="high")["total"] == 1


# ---------- compare ----------
def test_compare_explains_a_change(client, world):
    r = go(client, world, metric="revenue", group_by="city", period="last_month", compare_to_previous=True)
    assert r["total"] == 3500 and r["previous_total"] == 3500
    d = {x["label"]: x for x in r["rows"]}
    assert d["Delhi"]["previous"] == 3000 and d["Delhi"]["change"] == -1500
    assert d["Mumbai"]["change"] == 1500


def test_compare_contribution(client, world):
    r = go(client, world, metric="revenue", group_by="salesperson", period="last_3_months", compare_to_previous=True)
    assert r["previous_period"] is not None


def test_invalid_combinations(client, world):
    with pytest.raises(AnalyticsError):
        go(client, world, metric="revenue", group_by="status")
    with pytest.raises(AnalyticsError):
        go(client, world, metric="revenue", group_by="month", compare_to_previous=True)
    with pytest.raises(AnalyticsError):
        go(client, world, metric="revenue", period="all_time", compare_to_previous=True)


def test_unknown_fields_rejected():
    with pytest.raises(ValidationError):
        Q(metric="revenue", sql="DROP TABLE leads")
    with pytest.raises(ValidationError):
        Q(metric="email")


def test_hostile_filter_value_is_just_data(client, world):
    r = go(client, world, metric="revenue", city="x'; DROP TABLE sales;--")
    assert r["total"] == 0
    assert go(client, world, metric="revenue", period="all_time")["total"] > 0  # table intact


def test_executor_refuses_non_select(client):
    from sqlalchemy import delete

    from app.analyst.executor import run_select

    with client.session_factory() as db, pytest.raises(AnalyticsError):
        run_select(db, delete(Sale))