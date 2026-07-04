from __future__ import annotations

# Best-effort notify_* call sites -- every function here swallows send
# failures (logged, never raised); email is a notification about
# something that already happened, never a precondition for it. See
# docs/design/04-booking-and-scheduling.md's transactional-send list and
# scheduler section. CRIB: logand.app
# backend/src/logand_backend/domain/notifications/notify.py.
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig
    from melpino_backend.db.models.bookings import Booking
    from melpino_backend.db.models.invoices import Invoice


async def notify_booking_confirmed(
    db: "AsyncSession", cfg: "AppConfig", booking: "Booking", manage_url: str
) -> None:
    """Sends the confirmation email; recorded in the reminders_sent ledger."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def notify_booking_cancelled(
    db: "AsyncSession", cfg: "AppConfig", booking: "Booking"
) -> None:
    """Sends the cancellation email."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def notify_waitlist_offer(
    db: "AsyncSession", cfg: "AppConfig", booking_id: UUID, manage_url: str
) -> None:
    """Sends a freed-seat waitlist offer to the oldest fitting entry."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def notify_session_cancelled(
    db: "AsyncSession", cfg: "AppConfig", session_id: UUID
) -> None:
    """Notifies every confirmed booking on a session the admin just
    cancelled -- REQUIRED per docs/design/04."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def send_due_reminders(db: "AsyncSession", cfg: "AppConfig") -> int:
    """Sends `reminder` emails for bookings within reminder_days_before;
    idempotent via the reminders_sent unique ledger. Returns count sent."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def notify_invoice_sent(
    db: "AsyncSession", cfg: "AppConfig", invoice: "Invoice"
) -> None:
    """Sends the invoice email with PDF/plaintext/JSON attachments."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def notify_payment_received(
    db: "AsyncSession", cfg: "AppConfig", invoice: "Invoice", amount: Decimal
) -> None:
    """Sends the payment-received email."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
