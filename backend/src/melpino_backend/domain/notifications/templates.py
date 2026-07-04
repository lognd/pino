from __future__ import annotations

# Message-specific email content builders -- mailer.build_message wraps
# these in the shared terminal-window shell. See
# docs/design/04-booking-and-scheduling.md's confirmation/reminder/
# cancellation/waitlist-offer emails and docs/design/05's invoice/payment
# emails. CRIB: logand.app
# backend/src/logand_backend/domain/notifications/templates.py.
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from melpino_backend.app.config import AppConfig


def booking_confirmed(
    cfg: "AppConfig", *, booking_id: UUID, manage_url: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a new confirmed booking."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def booking_cancelled(cfg: "AppConfig", *, booking_id: UUID) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a cancelled booking."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def waitlist_offer(
    cfg: "AppConfig", *, session_title: str, manage_url: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a freed-seat waitlist offer."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def booking_reminder(
    cfg: "AppConfig", *, session_title: str, starts_at: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for the pre-class reminder."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def invoice_sent(
    cfg: "AppConfig",
    *,
    invoice_id: UUID,
    amount_total: Decimal,
    currency: str,
    due_date: str | None,
    pay_url: str | None = None,
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a new invoice."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


def payment_received(
    cfg: "AppConfig", *, invoice_id: UUID, amount: Decimal, currency: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a settled payment."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
