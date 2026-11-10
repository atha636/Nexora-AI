import uuid
from datetime import datetime

from pydantic import BaseModel


class Kpis(BaseModel):
    total_leads: int
    won_leads: int
    total_revenue: float
    conversion_rate: float  # percent, 0-100
    # These three modules arrive in later phases; until their tables exist the honest value is 0.
    active_workflows: int
    pending_approvals: int
    documents_indexed: int


class MonthRevenue(BaseModel):
    month: str  # "YYYY-MM"
    revenue: float
    deals: int


class MonthLeads(BaseModel):
    month: str
    created: int
    won: int  # of the leads created that month, how many are won today
    conversion_rate: float


class LabelCount(BaseModel):
    label: str
    count: int


class LabelRevenue(BaseModel):
    label: str
    revenue: float
    deals: int


class SalesPerson(BaseModel):
    id: uuid.UUID | None
    name: str
    revenue: float
    deals: int
    leads_assigned: int
    leads_won: int
    conversion_rate: float


class ActivityItem(BaseModel):
    id: uuid.UUID
    action: str
    entity_type: str
    summary: str
    actor_name: str | None
    created_at: datetime


class DashboardOverview(BaseModel):
    kpis: Kpis
    monthly_revenue: list[MonthRevenue]
    lead_acquisition: list[MonthLeads]
    leads_by_city: list[LabelCount]
    sales_performance: list[SalesPerson]
    recent_activity: list[ActivityItem]


class AnalyticsOverview(BaseModel):
    months: int
    kpis: Kpis
    leads_by_status: list[LabelCount]


class RevenueAnalytics(BaseModel):
    months: int
    total: float
    monthly: list[MonthRevenue]
    by_city: list[LabelRevenue]
    by_salesperson: list[SalesPerson]


class LeadAnalytics(BaseModel):
    months: int
    acquisition: list[MonthLeads]
    by_status: list[LabelCount]
    by_source: list[LabelCount]
    by_city: list[LabelCount]


class SaleCreate(BaseModel):
    amount: float
    sold_at: datetime | None = None
    lead_id: uuid.UUID | None = None
    salesperson_id: uuid.UUID | None = None


class SaleOut(BaseModel):
    id: uuid.UUID
    amount: float
    sold_at: datetime
    lead_id: uuid.UUID | None
    salesperson_id: uuid.UUID | None