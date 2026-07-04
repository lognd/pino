from __future__ import annotations

# Public course catalog + session listings -- see
# docs/design/04-booking-and-scheduling.md's public API surface.
from fastapi import APIRouter

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses() -> list[dict]:
    """GET /api/courses -- active courses w/ card fields."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.get("/{slug}")
async def get_course(slug: str) -> dict:
    """GET /api/courses/{slug} -- full course detail."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.get("/{slug}/sessions")
async def list_course_sessions(slug: str) -> list[dict]:
    """GET /api/courses/{slug}/sessions -- published+full future sessions."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
