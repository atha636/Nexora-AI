from datetime import datetime

from pydantic import BaseModel

from app.schemas.analytics import LabelCount, LabelRevenue, MonthLeads, MonthRevenue, SalesPerson


class PeriodFigures(BaseModel):
    """Everything here covers only the chosen period."""

    new_leads: int
    won_of_new: int  # of the leads created in the period, how many are won today
    conversion_rate: float
    revenue: float
    deals: int
    average_deal: float


class TaskFigures(BaseModel):
    open: int
    overdue: int
    completed_in_period: int


class ReportSummary(BaseModel):
    organization: str
    months: int
    period_start: str  # "YYYY-MM"
    period_end: str
    generated_at: datetime
    period: PeriodFigures
    tasks: TaskFigures
    monthly_revenue: list[MonthRevenue]
    acquisition: list[MonthLeads]
    revenue_by_city: list[LabelRevenue]
    by_salesperson: list[SalesPerson]
    leads_by_status: list[LabelCount]
    leads_by_source: list[LabelCount]
    leads_by_city: list[LabelCount]