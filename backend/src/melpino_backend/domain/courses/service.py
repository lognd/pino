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
    if session.status != "draft":
        logger.info(
            "publish_session: session_id=%s not draft (status=%s)",
            session_id,
            session.status,
        )
        return Err(CourseError.InvalidState)
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
    from melpino_backend.db.models.bookings import Booking
    from melpino_backend.db.models.invoices import Invoice
    from melpino_backend.domain.notifications import notify

    assert isinstance(cfg, AppConfig)
    session = await db.get(ClassSession, session_id)
    if session is None:
        logger.info("cancel_session: session_id=%s not found", session_id)
        return Err(CourseError.NotFound)

    # L2 guard: cancelling only makes sense from an active/pre-run state.
    # An already-cancelled session is a no-op (idempotent double-click);
    # a completed session must never be flipped back to cancelled --
    # mirrors publish_session's InvalidState guard above.
    if session.status == "cancelled":
        logger.info(
            "cancel_session: session_id=%s already cancelled; no-op", session_id
        )
        return Ok(session)
    if session.status not in ("draft", "published", "full"):
        logger.info(
            "cancel_session: session_id=%s not cancellable (status=%s)",
            session_id,
            session.status,
        )
        return Err(CourseError.InvalidState)

    session.status = "cancelled"
    await db.flush()

    # M1: a cancelled session must not leave its bookings 'confirmed' with
    # a still-payable deposit invoice -- bulk-flip confirmed bookings to
    # 'cancelled' and void their linked sent/overdue invoices BEFORE the
    # notification fan-out, in the same transaction as the session flip.
    bookings_stmt = select(Booking).where(
        and_(Booking.session_id == session_id, Booking.status == "confirmed")
    )
    bookings = list((await db.execute(bookings_stmt)).scalars().all())
    now = datetime.now(timezone.utc)
    invoice_ids = [b.invoice_id for b in bookings if b.invoice_id is not None]
    for booking in bookings:
        booking.status = "cancelled"
        booking.cancelled_at = now
    flagged_paid_invoice_count = 0
    if invoice_ids:
        from melpino_backend.domain.invoices.service import flag_invoice_needs_review

        invoices_stmt = select(Invoice).where(Invoice.id.in_(invoice_ids))
        invoices = list((await db.execute(invoices_stmt)).scalars().all())
        for invoice in invoices:
            if invoice.status in ("sent", "overdue"):
                invoice.status = "void"
            elif invoice.status == "paid":
                # L2: the guest already paid a deposit for a session that
                # will now never happen. Auto-refund is a deliberate
                # admin-manual decision (docs/design/05), but leaving
                # this collected with no signal at all means nobody ever
                # notices it's owed back -- flag it for review instead.
                await flag_invoice_needs_review(
                    db,
                    invoice,
                    "session was cancelled after this deposit invoice was "
                    "already paid -- review for a manual refund",
                )
                flagged_paid_invoice_count += 1
    await db.flush()
    logger.info(
        "cancel_session: session_id=%s cancelled; %d booking(s) cancelled, "
        "%d invoice(s) voided, %d paid invoice(s) flagged for review; "
        "notifying",
        session_id,
        len(bookings),
        len(invoice_ids),
        flagged_paid_invoice_count,
    )
    # Cascade cancellation emails to every booking that WAS confirmed on
    # this session -- best-effort, never fails the cancel itself (see
    # notify.py's swallow-and-log rule). Notified directly off the
    # `bookings` list captured above rather than via
    # notify.notify_session_cancelled's own re-query, since that query
    # filters on Booking.status == "confirmed" and would now find nothing
    # (we already flipped these rows to "cancelled" above).
    for booking in bookings:
        await notify.notify_booking_cancelled(db, cfg, booking)
    return Ok(session)
