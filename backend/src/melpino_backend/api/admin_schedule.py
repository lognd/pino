from __future__ import annotations

# Admin CRUD for courses/sessions -- stubbed at scaffold time, validated
# through the frontend mockup before being built for real. See
# docs/design/04-booking-and-scheduling.md and
# docs/design/14-admin-mockup.md.
#
# FINDINGS.md M3: cancel_session, publish_session, create_session, and
# create_on_behalf_booking are wired below to domain functions that
# ALREADY existed in domain/courses/service.py and domain/booking/
# service.py -- only the route-level wiring was missing (found while
# fixing M3: the "real feature build" the finding called for turned out
# to already have its domain logic implemented and unit-tested; the
# stubs just never called it). list_courses_admin, create_course, and
# get_session_roster have no backing domain function yet and remain
# NotImplementedError stubs -- tracked in TODO.md as a dedicated
# implementation pass, not silently dropped.
import argparse
import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.sessions import SessionInfo, require_staff
from melpino_backend.db.base import get_db
from melpino_backend.domain.booking.service import BookingInput, create_booking
from melpino_backend.domain.courses import service as courses_service
from melpino_backend.errors import BookingError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/schedule", tags=["admin-schedule"])

# Constructed once at import time, same pattern as api/bookings.py's _cfg --
# cancel_session's notification email needs mail config.
_cfg = AppConfig.from_external(argparse.Namespace())


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


class CreateSessionRequest(BaseModel):
    """Admin's new-session form -- course_id + the schedule window."""

    model_config = {}

    course_id: str
    starts_at: datetime
    ends_at: datetime


@router.post("/sessions")
async def create_session(
    payload: CreateSessionRequest,
    session: SessionInfo = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin schedules a new session for a course (draft status; rejects
    overlapping sessions on the same course)."""
    try:
        course_uuid = UUID(payload.course_id)
    except ValueError:
        raise to_http_exception(BookingError.SessionNotFound) from None

    result = await courses_service.create_session(
        db, course_uuid, starts_at=payload.starts_at, ends_at=payload.ends_at
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    class_session = result.danger_ok
    return {"session_id": str(class_session.id), "status": class_session.status}


@router.post("/sessions/{class_session_id}/publish")
async def publish_session(
    class_session_id: str,
    session: SessionInfo = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin publishes a draft session."""
    try:
        session_uuid = UUID(class_session_id)
    except ValueError:
        raise to_http_exception(BookingError.SessionNotFound) from None

    result = await courses_service.publish_session(db, session_uuid)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    class_session = result.danger_ok
    return {"session_id": str(class_session.id), "status": class_session.status}


@router.post("/sessions/{class_session_id}/cancel")
async def cancel_session(
    class_session_id: str,
    session: SessionInfo = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin cancels a session, cascading notification emails (REQUIRED).

    Delegates to domain/courses/service.py::cancel_session, which flips
    the session's status to 'cancelled', flips every affected booking to
    'cancelled' (and voids/flags its invoice), THEN fans out the
    REQUIRED cancellation email by looping notify.notify_booking_cancelled
    directly over the already-captured booking list -- deliberately NOT
    via notify.notify_session_cancelled. That function re-queries
    bookings by `status == "confirmed"`, which would find none once this
    cascade has already flipped them all to 'cancelled', so calling it
    here would silently send zero emails.
    """
    try:
        session_uuid = UUID(class_session_id)
    except ValueError:
        raise to_http_exception(BookingError.SessionNotFound) from None

    result = await courses_service.cancel_session(db, _cfg, session_uuid)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    class_session = result.danger_ok
    logger.info("admin cancel_session: session_id=%s cancelled by staff", session_uuid)
    return {"session_id": str(class_session.id), "status": class_session.status}


@router.get("/sessions/{class_session_id}/roster")
async def get_session_roster(
    class_session_id: str, session: SessionInfo = Depends(require_staff)
) -> list[dict]:
    """Admin roster listing for a session."""
    raise NotImplementedError("see docs/design/14-admin-mockup.md")  # TODO(impl)


class OnBehalfBookingRequest(BaseModel):
    """Phone-booking form Mel fills in on the caller's behalf -- same
    shape as the guest BookingCreateRequest minus the honeypot (there is
    no bot-abuse surface on an authenticated staff-only route) and minus
    a client-supplied attestation version (see the endpoint docstring:
    always stamped 'admin-phone', never trusted from the request)."""

    model_config = {}

    session_id: str
    full_name: str
    email: EmailStr
    phone: str | None = None
    party_size: int = 1
    attestation_accepted: bool = False
    sms_consent: bool = False


@router.post("/bookings/on-behalf")
async def create_on_behalf_booking(
    payload: OnBehalfBookingRequest,
    session: SessionInfo = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Phone bookings: Mel types what the caller says; skips rate limits,
    records attestation_version='admin-phone'. MUST pass
    BookingInput(source='admin') so the bookings-by-source billing
    metrics (api/admin_metrics.py) count it as a manual entry.

    Skips rate limits by construction: unlike POST /api/bookings, this
    route carries no `Depends(rate_limit(...))` -- it is staff-only
    (require_staff) and phone-volume is never bot-scale.
    """
    try:
        session_uuid = UUID(payload.session_id)
    except ValueError:
        raise to_http_exception(BookingError.SessionNotFound) from None

    result = await create_booking(
        db,
        _cfg,
        BookingInput(
            session_id=session_uuid,
            full_name=payload.full_name,
            email=payload.email,
            party_size=payload.party_size,
            attestation_version="admin-phone",
            attestation_accepted=payload.attestation_accepted,
            sms_consent=payload.sms_consent,
            phone=payload.phone or "",
            source="admin",
        ),
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    booking, _raw_token = result.danger_ok
    logger.info(
        "admin create_on_behalf_booking: booking_id=%s session_id=%s",
        booking.id,
        session_uuid,
    )
    return {"booking_id": str(booking.id)}
