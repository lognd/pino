from __future__ import annotations

# Invoice creation/payment recording/pay-token lookup -- see
# docs/design/05-payments-and-invoicing.md. CRIB: logand.app
# backend/src/logand_backend/domain/invoices/service.py -- row-lock
# discipline (`lock_invoice_for_update`), get_paid_so_far/
# settle_invoice_if_paid, manual-payment recording all copied verbatim in
# shape; melpino's deltas are pay-by-link (pay_token_hash, no customer
# accounts) and deposit-on-booking auto-creation.
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from typani.result import Result

from melpino_backend.errors import InvoiceError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig
    from melpino_backend.db.models.invoices import Invoice


async def lock_invoice_for_update(
    db: "AsyncSession", invoice_id: UUID
) -> Result["Invoice", InvoiceError]:
    """SELECT ... FOR UPDATE on the invoice row -- every read-then-act
    invoice operation locks the row first."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def create_deposit_invoice(
    db: "AsyncSession", *, booking_id: UUID, course_deposit: Decimal, party_size: int
) -> "Invoice":
    """Auto-creates a "Deposit -- {course.title}" invoice (amount =
    deposit * party_size) linked via bookings.invoice_id."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def get_paid_so_far(db: "AsyncSession", invoice_id: UUID) -> Decimal:
    """Sum of succeeded payments on an invoice."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def settle_invoice_if_paid(db: "AsyncSession", invoice_id: UUID) -> None:
    """Flips an invoice to 'paid' and sets paid_at once fully covered."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def record_manual_payment(
    db: "AsyncSession",
    invoice_id: UUID,
    *,
    method: str,
    amount: Decimal,
    recorded_by: UUID,
    note: str | None = None,
) -> Result[None, InvoiceError]:
    """Records a Zelle/cash/card-reader-outside-the-system payment."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def find_invoice_by_pay_token(
    db: "AsyncSession", raw_token: str
) -> Result["Invoice", InvoiceError]:
    """Pay-by-link lookup -- same mint/hash/404 semantics as booking
    manage tokens (see docs/design/02, 05)."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def invoice_unpaid_bookings_for_session(
    db: "AsyncSession", cfg: "AppConfig", session_id: UUID
) -> list["Invoice"]:
    """Admin: generates one invoice per still-unpaid booking on a session
    ("invoice everyone still unpaid for Saturday's class")."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def reconcile_pending_paypal_captures(
    db: "AsyncSession", cfg: "AppConfig"
) -> int:
    """Polls any Payment recorded 'pending' via PayPal for real
    settlement -- PayPal delivers no webhook for capture completion."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
