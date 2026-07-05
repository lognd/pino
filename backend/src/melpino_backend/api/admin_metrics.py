from __future__ import annotations

# Owner metrics -- how many bookings the SITE produced vs what Mel entered
# manually (bookings.source). The site owner's fee arrangement is keyed to
# site-originated bookings, so these numbers are billing data, not vanity
# stats: totals plus a monthly series, cancelled rows excluded (a cancelled
# booking produced no business).
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.auth.sessions import SessionInfo, require_admin
from melpino_backend.db.base import get_db
from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.class_sessions import ClassSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/metrics", tags=["admin-metrics"])


@router.get("/bookings-by-source")
async def bookings_by_source(
    db: AsyncSession = Depends(get_db),
    _admin: SessionInfo = Depends(require_admin),
) -> dict:
    """Booking counts split by origin ('web' = booked through the site,
    'admin' = entered manually), all-time and per month (YYYY-MM, newest
    first). Party sizes are summed separately so per-seat billing is also
    answerable from the same response."""
    # A booking whose own row is still 'confirmed' but whose *session* was
    # cancelled produced no business either (see M1 in FINDINGS.md) -- join
    # ClassSession so those drop out of the billing numbers too, without
    # requiring cancel_session to bulk-flip every affected booking row.
    not_cancelled = (Booking.status != "cancelled") & (
        ClassSession.status != "cancelled"
    )

    totals_stmt = (
        select(
            Booking.source,
            func.count(Booking.id),
            func.coalesce(func.sum(Booking.party_size), 0),
        )
        .join(ClassSession, ClassSession.id == Booking.session_id)
        .where(not_cancelled)
        .group_by(Booking.source)
    )
    totals = {"web": {"bookings": 0, "seats": 0}, "admin": {"bookings": 0, "seats": 0}}
    for source, count, seats in (await db.execute(totals_stmt)).all():
        totals[source] = {"bookings": int(count), "seats": int(seats)}

    month = func.to_char(func.date_trunc("month", Booking.created_at), "YYYY-MM")
    monthly_stmt = (
        select(
            month.label("month"),
            Booking.source,
            func.count(Booking.id),
            func.coalesce(func.sum(Booking.party_size), 0),
        )
        .join(ClassSession, ClassSession.id == Booking.session_id)
        .where(not_cancelled)
        .group_by("month", Booking.source)
        .order_by(month.desc())
    )
    monthly: dict[str, dict] = {}
    for month_key, source, count, seats in (await db.execute(monthly_stmt)).all():
        bucket = monthly.setdefault(
            month_key,
            {
                "month": month_key,
                "web": {"bookings": 0, "seats": 0},
                "admin": {"bookings": 0, "seats": 0},
            },
        )
        bucket[source] = {"bookings": int(count), "seats": int(seats)}

    logger.info(
        "bookings_by_source: web=%d admin=%d months=%d",
        totals["web"]["bookings"],
        totals["admin"]["bookings"],
        len(monthly),
    )
    return {"totals": totals, "monthly": list(monthly.values())}
