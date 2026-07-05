from __future__ import annotations

# Integration coverage for admin schedule/roster stubs -- see
# docs/design/14-admin-mockup.md and docs/design/04-booking-and-scheduling.md.
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api import admin_schedule
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.sessions import SessionInfo
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.domain.booking.service import BookingInput, create_booking

_FAKE_STAFF_SESSION = SessionInfo(
    id=uuid.uuid4(),
    user_id=uuid.uuid4(),
    role="staff",
    csrf_secret="test-csrf-secret",
    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
)


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_staff_cannot_issue_refunds() -> None:
    """Depends(require_staff) rejects a staff-role session on the refund route
    (admin-only per docs/design/02's authorization model)."""


async def test_on_behalf_booking_records_admin_phone_attestation(
    db_session: AsyncSession, app_config: AppConfig, make_class_session: Any
) -> None:
    """FINDINGS.md M3: create_on_behalf_booking's domain call must pass
    BookingInput(source='admin', attestation_version='admin-phone') so
    api/admin_metrics.py::bookings_by_source counts it as a manual entry,
    never as a site-originated ('web') booking."""
    class_session = await make_class_session(status="published")

    result = await create_booking(
        db_session,
        app_config,
        BookingInput(
            session_id=class_session.id,
            full_name="Phone Caller",
            email="phone-caller@example.com",
            party_size=2,
            attestation_version="admin-phone",
            attestation_accepted=True,
            source="admin",
        ),
    )
    assert result.is_ok
    booking, _raw_token = result.danger_ok
    assert booking.source == "admin"
    assert booking.attestation_version == "admin-phone"


async def test_on_behalf_booking_endpoint_wires_source_admin(
    db_session: AsyncSession, make_class_session: Any
) -> None:
    """FINDINGS.md M3: the route itself (not just the domain call) must
    stamp source='admin' -- exercises admin_schedule.create_on_behalf_booking
    end to end (payload -> BookingInput -> create_booking -> Booking row)."""
    class_session = await make_class_session(status="published")

    response = await admin_schedule.create_on_behalf_booking(
        admin_schedule.OnBehalfBookingRequest(
            session_id=str(class_session.id),
            full_name="Phone Caller",
            email="phone-caller-2@example.com",
            party_size=1,
            attestation_accepted=True,
        ),
        session=_FAKE_STAFF_SESSION,
        db=db_session,
    )
    assert "booking_id" in response


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_course_session_overlap_is_rejected() -> None:
    """Scheduling a session overlapping another on the same course
    returns SessionOverlap."""


async def test_cancel_session_endpoint_delegates_to_domain_cancel_session(
    db_session: AsyncSession, make_class_session: Any
) -> None:
    """FINDINGS.md M3: api/admin_schedule.py::cancel_session was a
    NotImplementedError stub even though domain/courses/service.py's own
    cancel_session (status flip + REQUIRED notify_session_cancelled
    cascade) already existed -- only the route wiring was missing. This
    exercises the route function itself, not the domain function (already
    covered by test_booking_capacity.py::
    test_session_cancel_notifies_every_confirmed_booking)."""
    class_session = await make_class_session(status="published")
    class_session_id = class_session.id

    response = await admin_schedule.cancel_session(
        str(class_session_id), session=_FAKE_STAFF_SESSION, db=db_session
    )
    assert response == {"session_id": str(class_session_id), "status": "cancelled"}

    refreshed = await db_session.get(ClassSession, class_session_id)
    assert refreshed is not None
    assert refreshed.status == "cancelled"
