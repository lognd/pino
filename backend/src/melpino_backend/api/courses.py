from __future__ import annotations

# Public course catalog + session listings -- see
# docs/design/04-booking-and-scheduling.md's public API surface. Public
# reads are rate-limited 120/min per docs/design/02 (the booking UI polls
# session listings).
import argparse
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.rate_limit import PUBLIC_READ, rate_limit
from melpino_backend.db.base import get_db
from melpino_backend.domain.booking.capacity import seats_taken
from melpino_backend.domain.courses.service import (
    get_course_by_slug,
    list_active_courses,
    list_bookable_sessions,
)

router = APIRouter(prefix="/api/courses", tags=["courses"])

# RateLimiter is constructed once at import time (it backs a Depends
# default), so redis_url comes from config here too -- see api/auth.py's
# identical NOTE.
_cfg = AppConfig.from_external(argparse.Namespace())
_public_read = rate_limit("public_read", *PUBLIC_READ, redis_url=_cfg.redis_url)


class CourseCard(BaseModel):
    """Card-length course fields for the catalog grid."""

    model_config = {}

    id: str
    slug: str
    kind: str
    title: str
    summary: str
    price: Decimal
    deposit: Decimal
    duration_min: int


class CourseDetail(CourseCard):
    """Full course detail (adds the long-form markdown description)."""

    description: str


class SessionCard(BaseModel):
    """A bookable session with seats-left in machine-usable form (the UI
    renders "N of M seats open" in plain words)."""

    model_config = {}

    id: str
    course_id: str
    starts_at: str
    ends_at: str
    location_name: str
    location_addr: str
    capacity: int
    seats_open: int
    status: str


def _card(course) -> CourseCard:
    return CourseCard(
        id=str(course.id),
        slug=course.slug,
        kind=course.kind,
        title=course.title,
        summary=course.summary,
        price=course.price,
        deposit=course.deposit,
        duration_min=course.duration_min,
    )


@router.get("")
async def list_courses(
    db: AsyncSession = Depends(get_db), _rl: None = Depends(_public_read)
) -> list[CourseCard]:
    """GET /api/courses -- active courses w/ card fields."""
    courses = await list_active_courses(db)
    return [_card(c) for c in courses]


@router.get("/{slug}")
async def get_course(
    slug: str, db: AsyncSession = Depends(get_db), _rl: None = Depends(_public_read)
) -> CourseDetail:
    """GET /api/courses/{slug} -- full course detail."""
    result = await get_course_by_slug(db, slug)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    c = result.danger_ok
    return CourseDetail(
        id=str(c.id),
        slug=c.slug,
        kind=c.kind,
        title=c.title,
        summary=c.summary,
        price=c.price,
        deposit=c.deposit,
        duration_min=c.duration_min,
        description=c.description,
    )


@router.get("/{slug}/sessions")
async def list_course_sessions(
    slug: str, db: AsyncSession = Depends(get_db), _rl: None = Depends(_public_read)
) -> list[SessionCard]:
    """GET /api/courses/{slug}/sessions -- published+full future sessions."""
    course_result = await get_course_by_slug(db, slug)
    if course_result.is_err:
        raise to_http_exception(course_result.danger_err)
    course = course_result.danger_ok
    sessions = await list_bookable_sessions(db, course.id)
    cards: list[SessionCard] = []
    for s in sessions:
        taken = await seats_taken(db, s.id)
        cards.append(
            SessionCard(
                id=str(s.id),
                course_id=str(s.course_id),
                starts_at=s.starts_at.isoformat(),
                ends_at=s.ends_at.isoformat(),
                location_name=s.location_name,
                location_addr=s.location_addr,
                capacity=s.capacity,
                seats_open=max(s.capacity - taken, 0),
                status=s.status,
            )
        )
    return cards
