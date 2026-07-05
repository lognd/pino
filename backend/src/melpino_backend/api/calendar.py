from __future__ import annotations

# Subscribable ICS calendar of class sessions -- what lets Mel's Google
# Calendar stay in sync with the site's schedule ("Other calendars > From
# URL"). Calendar apps cannot carry admin session cookies, so the feed is
# gated by a long random key in the URL (cfg.calendar_feed_key); unset
# key = feed disabled. The admin portal fetches the composed URL from the
# staff-authed /api/admin/calendar/feed-url to show a copy-paste box.
import argparse
import hmac
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.app.config import AppConfig
from melpino_backend.auth.sessions import SessionInfo, require_staff
from melpino_backend.db.base import get_db
from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.domain.calendar.ics import IcsEvent, build_calendar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])
admin_router = APIRouter(prefix="/api/admin/calendar", tags=["admin-calendar"])

_cfg = AppConfig.from_external(argparse.Namespace())

# How far back completed sessions stay in the feed (context, not clutter).
_PAST_HORIZON_DAYS = 30


def feed_url_for(cfg: AppConfig) -> str | None:
    """The subscribable feed URL, or None while no key is configured."""
    if not cfg.calendar_feed_key:
        return None
    return f"{cfg.public_base_url}/api/calendar/feed.ics?key={cfg.calendar_feed_key}"


@router.get("/feed.ics")
async def calendar_feed(
    key: str = "",
    db: AsyncSession = Depends(get_db),
) -> PlainTextResponse:
    """Every non-draft, non-cancelled session from the recent past onward,
    one VEVENT each with booked/capacity in the description. 404 (not 403)
    on a bad or missing key: the URL secret should not be oracle-able."""
    if not _cfg.calendar_feed_key or not hmac.compare_digest(
        key, _cfg.calendar_feed_key
    ):
        logger.info("calendar_feed: rejected request with bad/missing key")
        raise HTTPException(status_code=404, detail="not found")

    horizon = datetime.now(timezone.utc) - timedelta(days=_PAST_HORIZON_DAYS)
    seats = (
        select(
            Booking.session_id,
            func.coalesce(func.sum(Booking.party_size), 0).label("booked"),
        )
        .where(Booking.status.in_(("confirmed", "attended", "no_show")))
        .group_by(Booking.session_id)
        .subquery()
    )
    stmt = (
        select(ClassSession, Course.title, func.coalesce(seats.c.booked, 0))
        .join(Course, Course.id == ClassSession.course_id)
        .join(seats, seats.c.session_id == ClassSession.id, isouter=True)
        .where(
            ClassSession.status.notin_(("draft", "cancelled")),
            ClassSession.starts_at >= horizon,
        )
        .order_by(ClassSession.starts_at)
    )
    events: list[IcsEvent] = []
    for session, title, booked in (await db.execute(stmt)).all():
        location = session.location_name
        if session.location_addr:
            location = f"{session.location_name}, {session.location_addr}"
        events.append(
            IcsEvent(
                uid=f"session-{session.id}@melpino",
                summary=title,
                starts_at=session.starts_at,
                ends_at=session.ends_at,
                description=f"{int(booked)}/{session.capacity} seats booked",
                location=location,
            )
        )
    body = build_calendar(events, calendar_name=f"{_cfg.business_short_name} classes")
    logger.info("calendar_feed: served %d events", len(events))
    return PlainTextResponse(body, media_type="text/calendar; charset=utf-8")


@admin_router.get("/feed-url")
async def calendar_feed_url(
    _admin: SessionInfo = Depends(require_staff),
) -> dict:
    """The composed subscribe URL for the admin portal's calendar page
    (null while CALENDAR_FEED_KEY is unset -- the UI explains how to set
    it instead of showing a dead link)."""
    return {"feed_url": feed_url_for(_cfg)}
