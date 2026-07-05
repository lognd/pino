from __future__ import annotations

# Admin roster/records for students -- stubbed at scaffold time,
# validated through the frontend mockup before being built for real. See
# docs/design/14-admin-mockup.md.
#
# FINDINGS.md M1: mark_attended/mark_no_show are wired below to the
# domain functions in domain/booking/service.py, which already existed
# and were unit-tested -- only the route-level wiring was missing.
# list_students/get_student have no backing domain function yet and
# remain explicit 501s (see docs/design/14-admin-mockup.md), tracked in
# TODO.md, rather than letting a bare NotImplementedError propagate into
# an unhandled 500.
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.auth.sessions import SessionInfo, require_staff
from melpino_backend.db.base import get_db
from melpino_backend.domain.booking import service as booking_service
from melpino_backend.errors import BookingError

router = APIRouter(prefix="/api/admin/students", tags=["admin-students"])


@router.get("")
async def list_students(session: SessionInfo = Depends(require_staff)) -> list[dict]:
    """Admin student roster listing."""
    raise HTTPException(status_code=501, detail="not implemented")  # TODO(impl)


@router.get("/{student_id}")
async def get_student(
    student_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin student detail."""
    raise HTTPException(status_code=501, detail="not implemented")  # TODO(impl)


@router.post("/{student_id}/bookings/{booking_id}/mark-attended")
async def mark_attended(
    student_id: str,
    booking_id: str,
    session: SessionInfo = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin roster bookkeeping: confirmed -> attended."""
    try:
        booking_uuid = UUID(booking_id)
    except ValueError:
        raise to_http_exception(BookingError.NotFound) from None

    result = await booking_service.mark_attended(db, booking_uuid)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    await db.commit()
    return {"booking_id": booking_id, "status": "attended"}


@router.post("/{student_id}/bookings/{booking_id}/mark-no-show")
async def mark_no_show(
    student_id: str,
    booking_id: str,
    session: SessionInfo = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin roster bookkeeping: confirmed -> no_show."""
    try:
        booking_uuid = UUID(booking_id)
    except ValueError:
        raise to_http_exception(BookingError.NotFound) from None

    result = await booking_service.mark_no_show(db, booking_uuid)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    await db.commit()
    return {"booking_id": booking_id, "status": "no_show"}
