from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.analytics import (
    AnalyticsOverview,
    DashboardOverview,
    LeadAnalytics,
    RevenueAnalytics,
)
from app.services import analytics as svc

# Both routers are read-only and open to every member of the organization.
dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"])
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])

Months = Query(12, ge=1, le=24, description="How many calendar months to include")


@dashboard_router.get("/overview", response_model=DashboardOverview)
def dashboard_overview(
    ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> DashboardOverview:
    org = ctx.organization_id
    return DashboardOverview(
        kpis=svc.kpis(db, org),
        monthly_revenue=svc.monthly_revenue(db, org, 12),
        lead_acquisition=svc.lead_acquisition(db, org, 12),
        leads_by_city=svc.leads_by_city(db, org, 8),
        sales_performance=svc.sales_performance(db, org, 12),
        recent_activity=svc.recent_activity(db, org, 10),
    )


@analytics_router.get("/overview", response_model=AnalyticsOverview)
def analytics_overview(
    months: int = Months,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> AnalyticsOverview:
    org = ctx.organization_id
    return AnalyticsOverview(months=months, kpis=svc.kpis(db, org), leads_by_status=svc.leads_by_status(db, org))


@analytics_router.get("/revenue", response_model=RevenueAnalytics)
def analytics_revenue(
    months: int = Months,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> RevenueAnalytics:
    org = ctx.organization_id
    monthly = svc.monthly_revenue(db, org, months)
    return RevenueAnalytics(
        months=months,
        total=round(sum(m.revenue for m in monthly), 2),
        monthly=monthly,
        by_city=svc.revenue_by_city(db, org, months),
        by_salesperson=svc.sales_performance(db, org, months),
    )


@analytics_router.get("/leads", response_model=LeadAnalytics)
def analytics_leads(
    months: int = Months,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> LeadAnalytics:
    org = ctx.organization_id
    return LeadAnalytics(
        months=months,
        acquisition=svc.lead_acquisition(db, org, months),
        by_status=svc.leads_by_status(db, org),
        by_source=svc.leads_by_source(db, org),
        by_city=svc.leads_by_city(db, org, 10),
    )