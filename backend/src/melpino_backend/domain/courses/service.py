from __future__ import annotations

# Course catalog reads + admin scheduling CRUD -- see
# docs/design/04-booking-and-scheduling.md's public API surface and admin
# CRUD list.
from typing import TYPE_CHECKING
from uuid import UUID

from typani.result import Result

from melpino_backend.errors import CourseError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.db.models.class_sessions import ClassSession
    from melpino_backend.db.models.courses import Course


async def list_active_courses(db: "AsyncSession") -> list["Course"]:
    """GET /api/courses -- active courses with card-length fields."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def get_course_by_slug(
    db: "AsyncSession", slug: str
) -> Result["Course", CourseError]:
    """GET /api/courses/{slug} -- full course detail."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def list_bookable_sessions(
    db: "AsyncSession", course_id: UUID
) -> list["ClassSession"]:
    """GET /api/courses/{slug}/sessions -- published+full future sessions
    (full shown so the UI can offer the waitlist)."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def create_session(
    db: "AsyncSession", course_id: UUID, *, starts_at: object, ends_at: object
) -> Result["ClassSession", CourseError]:
    """Admin: schedules a new session; rejects overlapping sessions."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def publish_session(
    db: "AsyncSession", session_id: UUID
) -> Result["ClassSession", CourseError]:
    """Admin: draft -> published."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def cancel_session(
    db: "AsyncSession", session_id: UUID
) -> Result["ClassSession", CourseError]:
    """Admin: cancels a session, cascading notification emails to every
    confirmed booking (REQUIRED -- see docs/design/04)."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
