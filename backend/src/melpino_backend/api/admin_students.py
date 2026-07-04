from __future__ import annotations

# Admin roster/records for students -- stubbed at scaffold time,
# validated through the frontend mockup before being built for real. See
# docs/design/14-admin-mockup.md.
from fastapi import APIRouter, Depends

from melpino_backend.auth.sessions import SessionInfo, require_staff

router = APIRouter(prefix="/api/admin/students", tags=["admin-students"])


@router.get("")
async def list_students(session: SessionInfo = Depends(require_staff)) -> list[dict]:
    """Admin student roster listing."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.get("/{student_id}")
async def get_student(
    student_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin student detail."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


@router.post("/{student_id}/bookings/{booking_id}/mark-attended")
async def mark_attended(
    student_id: str, booking_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin roster bookkeeping: confirmed -> attended."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.post("/{student_id}/bookings/{booking_id}/mark-no-show")
async def mark_no_show(
    student_id: str, booking_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin roster bookkeeping: confirmed -> no_show."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
