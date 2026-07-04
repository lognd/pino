from __future__ import annotations

# Integration coverage for the one real race in this codebase -- see
# docs/design/04-booking-and-scheduling.md's capacity-locking section.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_concurrent_last_seat_race() -> None:
    """Two concurrent create_booking calls for a 1-seat session --
    exactly one succeeds."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_waitlist_offer_on_cancellation_picks_oldest_that_fits() -> None:
    """Cancelling a booking offers the freed seat to the oldest
    waitlist entry that fits."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_reminder_ledger_idempotency() -> None:
    """Running the reminder sweep twice sends exactly one email per booking."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_session_cancel_notifies_every_confirmed_booking() -> None:
    """Admin-cancelling a session with confirmed bookings emails every one of them."""
