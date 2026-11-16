"""Turns "last month" or "1 Jan to 31 Mar" into exact dates, and finds the period before it.

All dates are UTC calendar dates. A Period is half-open: `start` is included, `end` is NOT, so
"October" is 1 Oct (inclusive) to 1 Nov (exclusive). This avoids off-by-one mistakes at month ends.
"""

import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from app.analyst.spec import MAX_FILTER_DAYS, AnalyticsError, AnalyticsQuery


def today() -> date:
    """Separate function so tests can pin "today"."""
    return datetime.now(timezone.utc).date()


@dataclass(frozen=True)
class Period:
    kind: str  # a preset name, or "custom"
    start: date | None  # inclusive; None = from the beginning of time
    end: date | None  # EXCLUSIVE; None = no upper bound
    label: str

    @property
    def last_day(self) -> date | None:
        return self.end - timedelta(days=1) if self.end else None

    def bounds(self) -> tuple[datetime | None, datetime | None]:
        def at_midnight(d: date | None) -> datetime | None:
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) if d else None

        return at_midnight(self.start), at_midnight(self.end)

    def describe(self) -> dict:
        return {
            "label": self.label,
            "start": self.start.isoformat() if self.start else None,
            "end": self.last_day.isoformat() if self.last_day else None,  # shown inclusive to humans
        }


def first_of_month(d: date) -> date:
    return d.replace(day=1)


def shift_months(first: date, months: int) -> date:
    """`first` must be a 1st of a month; returns the 1st of the month `months` away."""
    index = first.year * 12 + (first.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def _month_name(d: date) -> str:
    return f"{calendar.month_abbr[d.month]} {d.year}"


def _day(d: date) -> str:
    return f"{d.day} {calendar.month_abbr[d.month]} {d.year}"


def resolve(q: AnalyticsQuery, now: date | None = None) -> Period:
    now = now or today()
    this_month = first_of_month(now)
    if q.start_date is not None and q.end_date is not None:
        if q.end_date < q.start_date:
            raise AnalyticsError("end_date must not be before start_date.")
        if (q.end_date - q.start_date).days > MAX_FILTER_DAYS:
            raise AnalyticsError("That date range is too long. Choose a range of at most 5 years.")
        return Period("custom", q.start_date, q.end_date + timedelta(days=1), f"{_day(q.start_date)} to {_day(q.end_date)}")

    preset = q.period or "last_12_months"
    if preset == "this_month":
        return Period(preset, this_month, now + timedelta(days=1), f"This month so far ({_day(this_month)} to {_day(now)})")
    if preset == "last_month":
        start = shift_months(this_month, -1)
        return Period(preset, start, this_month, f"Last month ({_month_name(start)})")
    if preset in ("last_3_months", "last_6_months", "last_12_months"):
        n = int(preset.split("_")[1])
        start = shift_months(this_month, -n)
        last = shift_months(this_month, -1)
        return Period(preset, start, this_month, f"Last {n} full months ({_month_name(start)} to {_month_name(last)})")
    if preset == "this_year":
        start = date(now.year, 1, 1)
        return Period(preset, start, now + timedelta(days=1), f"This year so far ({_day(start)} to {_day(now)})")
    if preset == "last_year":
        return Period(preset, date(now.year - 1, 1, 1), date(now.year, 1, 1), f"Last year ({now.year - 1})")
    return Period("all_time", None, None, "All time")


def previous(period: Period) -> Period:
    """The period to compare against: the one that comes right before, of equal length (or the
    same stretch of the earlier month/year for "so far" periods)."""
    if period.start is None or period.end is None:
        raise AnalyticsError("There is no previous period for all_time.")
    start, end = period.start, period.end
    if period.kind == "last_month":
        prev = shift_months(start, -1)
        return Period("previous", prev, start, f"The month before ({_month_name(prev)})")
    if period.kind in ("last_3_months", "last_6_months", "last_12_months"):
        n = int(period.kind.split("_")[1])
        prev = shift_months(start, -n)
        return Period("previous", prev, start, f"The {n} months before ({_month_name(prev)} to {_month_name(shift_months(start, -1))})")
    if period.kind == "last_year":
        return Period("previous", date(start.year - 1, 1, 1), start, f"The year before ({start.year - 1})")
    if period.kind == "this_month":
        prev_start = shift_months(start, -1)
        prev_end = min(prev_start + (end - start), start)
        return Period("previous", prev_start, prev_end, f"Same days last month ({_day(prev_start)} to {_day(prev_end - timedelta(days=1))})")
    if period.kind == "this_year":
        prev_start = date(start.year - 1, 1, 1)
        prev_end = min(prev_start + (end - start), start)
        return Period("previous", prev_start, prev_end, f"Same days last year ({_day(prev_start)} to {_day(prev_end - timedelta(days=1))})")
    span = end - start  # custom
    prev_start = start - span
    return Period("previous", prev_start, start, f"The {span.days} days before ({_day(prev_start)} to {_day(start - timedelta(days=1))})")
