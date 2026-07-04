from __future__ import annotations

# End-to-end guest booking journey against a real (fake-SMTP-backed)
# stack -- see docs/design/04-booking-and-scheduling.md's system-test
# obligations.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_browse_book_confirm_receive_email_cancel() -> None:
    """Browse courses -> book a session -> receive a fake-SMTP confirmation
    email -> use the manage link to cancel."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_waitlist_promotion_journey() -> None:
    """Join a full session's waitlist -> a cancellation frees a seat ->
    receive a waitlist_offer email -> complete the booking from that link."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_deposit_payment_via_fake_stripe() -> None:
    """A deposit-course booking's confirmation screen pays via fake_stripe
    and the invoice settles."""
