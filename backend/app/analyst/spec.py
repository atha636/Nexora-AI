"""What a question about the business can look like.

Instead of letting an AI write SQL (and then trying to spot dangerous SQL), the AI fills in this
small form: a METRIC, an optional GROUPING, a time PERIOD and a few FILTERS. Our code turns the
form into a query. Because the form can only name things in the lists below, the AI can only ask
for approved numbers: no other tables, no emails or phone numbers, no INSERT or DELETE, and no
way to leave its own organization. This is an allow-list, which is much safer than a block-list
of "bad SQL".
"""

from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class AnalyticsError(Exception):
    """The question can't be answered as asked. The message is safe to show, and helps the AI
    (or the user) fix the request."""


Metric = Literal["revenue", "deals", "avg_deal", "leads", "won_leads", "conversion_rate"]
Dimension = Literal["month", "city", "salesperson", "source", "priority", "status"]
Preset = Literal[
    "this_month", "last_month", "last_3_months", "last_6_months", "last_12_months", "this_year", "last_year", "all_time"
]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


@dataclass(frozen=True)
class MetricDef:
    key: str
    label: str
    unit: Literal["currency", "count", "percent"]
    table: Literal["sales", "leads"]  # which table the number comes from
    description: str


METRICS: dict[str, MetricDef] = {
    m.key: m
    for m in [
        MetricDef("revenue", "Revenue", "currency", "sales", "Total value of closed deals (INR)."),
        MetricDef("deals", "Deals closed", "count", "sales", "Number of closed deals."),
        MetricDef("avg_deal", "Average deal size", "currency", "sales", "Revenue divided by deals (INR)."),
        MetricDef("leads", "New leads", "count", "leads", "Leads created in the period."),
        MetricDef("won_leads", "Won leads", "count", "leads", "Leads created in the period that are now won."),
        MetricDef(
            "conversion_rate", "Conversion rate", "percent", "leads",
            "Won leads as a percentage of leads created in the period.",
        ),
    ]
}

# Which ways of grouping/filtering make sense for each source table.
DIMENSIONS: dict[str, tuple[str, set[str]]] = {
    "month": ("Month", {"sales", "leads"}),
    "city": ("City", {"sales", "leads"}),  # for sales: the city of the lead the deal came from
    "salesperson": ("Salesperson", {"sales", "leads"}),  # for leads: the assigned employee
    "source": ("Lead source", {"sales", "leads"}),
    "priority": ("Lead priority", {"sales", "leads"}),
    "status": ("Lead status", {"leads"}),
}
DIMENSION_LABELS = {k: v[0] for k, v in DIMENSIONS.items()}
FILTER_DIMENSIONS = ("city", "salesperson", "source", "priority", "status")  # everything except month

MAX_LIMIT = 50
MAX_FILTER_DAYS = 366 * 5


class AnalyticsQuery(BaseModel):
    """One question for the analytics engine. Flat on purpose: simple for an AI to fill in."""

    model_config = ConfigDict(extra="forbid")

    metric: Metric = Field(description="The number to calculate")
    group_by: Dimension | None = Field(
        None, description="Break the number down by this. Use 'month' for trends over time. Omit for a single total."
    )
    period: Preset | None = Field(
        None,
        description="Time range. Whole calendar months: last_month, last_3_months, last_6_months, last_12_months "
        "(these exclude the current, unfinished month). this_month and this_year are 'so far'. "
        "Default: last_12_months. Do not combine with start_date/end_date.",
    )
    start_date: date | None = Field(None, description="Custom range start (YYYY-MM-DD, inclusive). Needs end_date.")
    end_date: date | None = Field(None, description="Custom range end (YYYY-MM-DD, inclusive). Needs start_date.")
    city: Short | None = Field(None, description="Only include this city")
    salesperson: Short | None = Field(None, description="Only include this salesperson (full name)")
    source: Short | None = Field(None, description="Only include this lead source")
    priority: Literal["low", "medium", "high"] | None = Field(None, description="Only include this lead priority")
    status: Literal["new", "contacted", "qualified", "won", "lost"] | None = Field(
        None, description="Only include leads with this status (lead metrics only)"
    )
    compare_to_previous: bool = Field(
        False,
        description="Also calculate the same thing for the previous period of equal length and show the change. "
        "Use with a group_by (city, salesperson, source...) to find what drove an increase or decrease. "
        "Cannot be combined with group_by=month or period=all_time.",
    )
    limit: int = Field(10, ge=1, le=MAX_LIMIT, description="Maximum groups to return")

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        if isinstance(data, dict):
            return {k: (None if isinstance(v, str) and not v.strip() else v) for k, v in data.items()}
        return data

    @model_validator(mode="after")
    def _period_choice(self):
        has_dates = self.start_date is not None or self.end_date is not None
        if has_dates and self.period is not None:
            raise ValueError("use either 'period' or start_date/end_date, not both")
        if has_dates and (self.start_date is None or self.end_date is None):
            raise ValueError("start_date and end_date must be given together")
        if not has_dates and self.period is None:
            self.period = "last_12_months"
        return self

    @property
    def filters(self) -> list[tuple[str, str]]:
        return [(d, str(getattr(self, d))) for d in FILTER_DIMENSIONS if getattr(self, d) is not None]


def validate_for_metric(q: AnalyticsQuery) -> MetricDef:
    """Checks combinations that are individually valid but make no sense together."""
    metric = METRICS[q.metric]
    allowed = sorted(d for d, (_, tables) in DIMENSIONS.items() if metric.table in tables)
    if q.group_by and metric.table not in DIMENSIONS[q.group_by][1]:
        raise AnalyticsError(f"'{q.metric}' can't be grouped by '{q.group_by}'. Choose one of: {', '.join(allowed)}.")
    for dim, _ in q.filters:
        if metric.table not in DIMENSIONS[dim][1]:
            raise AnalyticsError(f"'{q.metric}' can't be filtered by '{dim}'. Filters allowed: {', '.join(d for d in allowed if d != 'month')}.")
    if q.compare_to_previous:
        if q.group_by == "month":
            raise AnalyticsError("compare_to_previous can't be combined with group_by=month. Compare by city, salesperson or source instead.")
        if q.period == "all_time":
            raise AnalyticsError("compare_to_previous needs a bounded period (not all_time).")
    return metric
