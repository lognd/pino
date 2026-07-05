from __future__ import annotations

# Admin CRUD for courses/sessions -- stubbed at scaffold time, validated
# through the frontend mockup before being built for real. See
# docs/design/04-booking-and-scheduling.md and
# docs/design/14-admin-mockup.md.
from fastapi import APIRouter, Depends

from melpino_backend.auth.sessions import SessionInfo, require_staff

router = APIRouter(prefix="/api/admin/schedule", tags=["admin-schedule"])


@router.get("/courses")
async def list_courses_admin(
    session: SessionInfo = Depends(require_staff),
) -> list[dict]:
    """Admin course listing, including inactive courses."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.post("/courses")
async def create_course(session: SessionInfo = Depends(require_staff)) -> dict:
    """Admin creates a new course."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.post("/sessions")
async def create_session(session: SessionInfo = Depends(require_staff)) -> dict:
    """Admin schedules a new session for a course."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.post("/sessions/{class_session_id}/publish")
async def publish_session(
    class_session_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin publishes a draft session."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.post("/sessions/{class_session_id}/cancel")
async def cancel_session(
    class_session_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin cancels a session, cascading notification emails (REQUIRED)."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.get("/sessions/{class_session_id}/roster")
async def get_session_roster(
    class_session_id: str, session: SessionInfo = Depends(require_staff)
) -> list[dict]:
    """Admin roster listing for a session."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.post("/bookings/on-behalf")
async def create_on_behalf_booking(
    session: SessionInfo = Depends(require_staff),
) -> dict:
    """Phone bookings: Mel types what the caller says; skips rate limits,
    records attestation_version='admin-phone'. MUST pass
    BookingInput(source='admin') so the bookings-by-source billing
    metrics (api/admin_metrics.py) count it as a manual entry."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
