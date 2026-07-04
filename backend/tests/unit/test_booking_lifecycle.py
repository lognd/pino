from __future__ import annotations

# Unit coverage for the booking state machine and guest manage tokens --
# see docs/design/04-booking-and-scheduling.md and
# docs/design/02-auth-and-security.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
def test_cancel_already_cancelled_booking_is_rejected() -> None:
    """cancel_booking on an already-cancelled booking returns AlreadyCancelled."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
def test_guest_cancel_after_window_is_rejected() -> None:
    """A guest cancel inside booking_cancellation_hours succeeds; after it 409s."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
def test_cancellation_window_math_handles_dst_transition() -> None:
    """The cancellation-window boundary is computed correctly across a DST change."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_manage_token_round_trip() -> None:
    """Creating a booking mints a token; that token fetches it; a wrong token 404s."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_manage_token_expires_30_days_after_session_end() -> None:
    """A manage token lookup past the 30-day post-session window
    returns TokenInvalid."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_manage_token_never_appears_in_logs() -> None:
    """Grep captured log output for the raw token after a booking
    flow -- must be absent."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_cross_booking_token_isolation() -> None:
    """Booking A's manage token cannot fetch or cancel booking B."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_honeypot_field_filled_rejects_silently() -> None:
    """A filled honeypot field rejects the booking with no row created."""
