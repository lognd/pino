from __future__ import annotations

# Course catalog reads + admin scheduling CRUD -- see
# docs/design/04-booking-and-scheduling.md's public API surface and admin
# CRUD list.
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import and_, select
from typani.result import Err, Ok, Result

from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.errors import CourseError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def list_active_courses(db: "AsyncSession") -> list["Course"]:
    """GET /api/courses -- active courses with card-length fields."""
    stmt = select(Course).where(Course.is_active.is_(True)).order_by(Course.title)
    courses = list((await db.execute(stmt)).scalars().all())
    logger.info("list_active_courses: %d active course(s)", len(courses))
    return courses


async def get_course_by_slug(
    db: "AsyncSession", slug: str
) -> Result["Course", CourseError]:
    """GET /api/courses/{slug} -- full course detail."""
    stmt = select(Course).where(Course.slug == slug)
    course = (await db.execute(stmt)).scalars().first()
    if course is None:
        logger.info("get_course_by_slug: slug=%s not found", slug)
        return Err(CourseError.NotFound)
    return Ok(course)


async def list_bookable_sessions(
    db: "AsyncSession", course_id: UUID
) -> list["ClassSession"]:
    """GET /api/courses/{slug}/sessions -- published+full future sessions
    (full shown so the UI can offer the waitlist)."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(ClassSession)
        .where(
            ClassSession.course_id == course_id,
            ClassSession.status.in_(("published", "full")),
            ClassSession.starts_at > now,
        )
        .order_by(ClassSession.starts_at)
    )
    sessions = list((await db.execute(stmt)).scalars().all())
    logger.info(
        "list_bookable_sessions: course_id=%s -> %d session(s)",
        course_id,
        len(sessions),
    )
    return sessions


async def create_session(
    db: "AsyncSession", course_id: UUID, *, starts_at: object, ends_at: object
) -> Result["ClassSession", CourseError]:
    """Admin: schedules a new session; rejects overlapping sessions."""
    assert isinstance(starts_at, datetime)
    assert isinstance(ends_at, datetime)
    course = await db.get(Course, course_id)
    if course is None:
        logger.info("create_session: course_id=%s not found", course_id)
        return Err(CourseError.NotFound)

    # Overlap = any non-cancelled session on the same course whose window
    # intersects [starts_at, ends_at).
    overlap_stmt = select(ClassSession).where(
        ClassSession.course_id == course_id,
        ClassSession.status != "cancelled",
        and_(
            ClassSession.starts_at < ends_at,
            ClassSession.ends_at > starts_at,
        ),
    )
    if (await db.execute(overlap_stmt)).scalars().first() is not None:
        logger.info("create_session: overlap for course_id=%s", course_id)
        return Err(CourseError.SessionOverlap)

    session = ClassSession(
        course_id=course_id,
        starts_at=starts_at,
        ends_at=ends_at,
        location_name="",
        capacity=course.default_capacity,
        status="draft",
    )
    db.add(session)
    await db.flush()
    logger.info("create_session: created session_id=%s (draft)", session.id)
    return Ok(session)


async def publish_session(
    db: "AsyncSession", session_id: UUID
) -> Result["ClassSession", CourseError]:
    """Admin: draft -> published."""
    session = await db.get(ClassSession, session_id)
    if session is None:
        logger.info("publish_session: session_id=%s not found", session_id)
        return Err(CourseError.NotFound)
    session.status = "published"
    await db.flush()
    logger.info("publish_session: session_id=%s published", session_id)
    return Ok(session)


async def cancel_session(
    db: "AsyncSession", cfg: object, session_id: UUID
) -> Result["ClassSession", CourseError]:
    """Admin: cancels a session, cascading notification emails to every
    confirmed booking (REQUIRED -- see docs/design/04).

    JUDGMENT CALL: the scaffold stub took (db, session_id) only, but the
    cascade of confirmed-booking cancellation emails needs AppConfig
    (public_base_url, mail transport) -- cfg is threaded in so the
    required notification cascade can actually fire. See mission report.
    """
    from melpino_backend.app.config import AppConfig
    from melpino_backend.domain.notifications import notify

    assert isinstance(cfg, AppConfig)
    session = await db.get(ClassSession, session_id)
    if session is None:
        logger.info("cancel_session: session_id=%s not found", session_id)
        return Err(CourseError.NotFound)

    session.status = "cancelled"
    await db.flush()
    logger.info("cancel_session: session_id=%s cancelled; notifying", session_id)
    # Cascade cancellation emails to every confirmed booking -- best-effort,
    # never fails the cancel itself (see notify.py's swallow-and-log rule).
    await notify.notify_session_cancelled(db, cfg, session_id)
    return Ok(session)
