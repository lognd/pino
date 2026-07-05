from __future__ import annotations

# Recurring-invoice generation (standing private lessons) -- see
# docs/design/05-payments-and-invoicing.md: "copy the mechanism (Mel may
# run a recurring private-lesson arrangement) but it is LOW priority --
# stub + TODO." CRIB: logand.app
# backend/src/logand_backend/domain/invoices/recurrence.py -- the copied
# mechanism's shape (interval math, one-child-per-cycle via flipping
# is_recurring off on the parent, skip_locked against overlapping runs,
# sent->overdue sweep) is preserved in the signatures/docstrings below
# so the eventual implementation is a straight port, not a redesign.
#
# Deliberately NOT wired into scripts/scheduler.py yet (per this phase's
# scope) -- nothing calls these functions.
import calendar
from datetime import date, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_MONTH_STEPS = {"monthly": 1, "quarterly": 3, "yearly": 12}


def _advance(d: date, interval: str | None) -> date:
    """Adds one period of `interval` to `d` -- pure date math (no
    python-dateutil dependency for one function), copied verbatim from
    logand since it is already correct and directly unit-testable."""
    if interval == "weekly":
        return d + timedelta(weeks=1)
    if interval in _MONTH_STEPS:
        months_total = d.month - 1 + _MONTH_STEPS[interval]
        year = d.year + months_total // 12
        month = months_total % 12 + 1
        day = min(d.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
    # The DB CheckConstraint on recurrence_interval already restricts this
    # to one of the four known values or null; an unrecognized value here
    # is a data bug, not something to silently skip billing for.
    raise ValueError(f"unrecognized recurrence_interval: {interval!r}")


async def generate_due_recurring_invoices(
    db: "AsyncSession", as_of: date
) -> list[UUID]:
    """Walks invoices WHERE is_recurring AND status in (sent/overdue/paid)
    past their due_date and creates the next cycle's draft -- exactly one
    child per cycle (generating a child flips is_recurring off on the
    parent; the child carries is_recurring=True forward), with
    skip_locked row claims so overlapping runs never double-generate.

    # TODO(recurrence): implement by porting logand.app's
    # generate_due_recurring_invoices (swap customer_id -> student_id and
    # mint a pay_token_hash for each child via service.mint_pay_token --
    # melpino invoices require one). LOW priority per docs/design/05; do
    # not wire into scripts/scheduler.py until Mel actually runs a
    # recurring arrangement.
    """
    raise NotImplementedError(
        "recurring invoices are deferred -- see docs/design/05"
    )  # TODO(recurrence)


async def mark_overdue_invoices(db: "AsyncSession", as_of: date) -> list[UUID]:
    """Flips sent -> overdue for every invoice whose due_date has passed
    (idempotent day over day; only 'sent' rows are eligible).

    # TODO(recurrence): implement by porting logand.app's
    # mark_overdue_invoices verbatim (no melpino-specific delta at all)
    # when recurrence lands -- it shares this module because both are the
    # same daily due-date sweep in logand's scheduler.
    """
    raise NotImplementedError(
        "overdue sweep is deferred with recurrence -- see docs/design/05"
    )  # TODO(recurrence)
