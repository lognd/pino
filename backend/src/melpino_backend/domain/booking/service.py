from __future__ import annotations

# Booking lifecycle: create, cancel, waitlist -- see
# docs/design/04-booking-and-scheduling.md. Every mutating function locks
# the session row (domain/booking/capacity.py) before reading/writing
# seat counts, mirroring logand.app's invoice row-lock discipline.
from typing import TYPE_CHECKING
from uuid import UUID

from typani.result import Result

from melpino_backend.errors import BookingError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.db.models.bookings import Booking


class BookingInput:
    """Guest-submitted booking form fields -- session_id, contact info,
    party_size, attestation, sms_consent, honeypot_field."""


async def create_booking(
    db: "AsyncSession", payload: BookingInput
) -> Result["Booking", BookingError]:
    """Locks the session row, checks capacity/status, dedups the student,
    inserts the booking, and flips the session to 'full' if now at
    capacity -- see docs/design/04's transaction description."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def cancel_booking(
    db: "AsyncSession", booking_id: UUID, *, by_admin: bool
) -> Result["Booking", BookingError]:
    """Cancels a booking inside the same session-row lock as create_booking;
    un-flips 'full' and triggers a waitlist offer if a seat freed.
    Guest cancels are rejected with CancellationWindowClosed past
    AppConfig.booking_cancellation_hours before starts_at; admin cancels
    have no window."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def join_waitlist(
    db: "AsyncSession", payload: BookingInput
) -> Result[None, BookingError]:
    """Adds a student to a full session's waitlist -- no seat reservation,
    no expiring claim (see docs/design/04's locked decision)."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def mark_attended(
    db: "AsyncSession", booking_id: UUID
) -> Result[None, BookingError]:
    """Admin roster bookkeeping: confirmed -> attended."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def mark_no_show(
    db: "AsyncSession", booking_id: UUID
) -> Result[None, BookingError]:
    """Admin roster bookkeeping: confirmed -> no_show."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
