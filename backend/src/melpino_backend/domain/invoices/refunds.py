from __future__ import annotations

# Refund issuance (full/partial) against a Payment -- see
# docs/design/05-payments-and-invoicing.md ("copy logand.app's refund
# variants/status codes verbatim"). CRIB: logand.app
# backend/src/logand_backend/domain/invoices/refunds.py -- idempotency
# via caller-supplied client_request_id, lock-then-release-before-
# provider-call discipline, and payment/invoice status transitions
# copied verbatim in shape.
import asyncio
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

import stripe
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from typani.result import Err, Ok, Result

from melpino_backend.domain.invoices.service import lock_invoice_for_update
from melpino_backend.domain.payments.currency import to_minor_units
from melpino_backend.domain.payments.providers import paypal
from melpino_backend.errors import PaymentProviderError, RefundError
from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig

_log = get_logger(__name__)

# Provider-reported refund statuses collapsed to what
# db/models/invoices.py's _REFUND_STATUS_CHECK allows.
STRIPE_REFUND_STATUS_MAP = {
    "succeeded": "succeeded",
    "failed": "failed",
    "canceled": "failed",
    "pending": "pending",
}
_PAYPAL_REFUND_STATUS_MAP = {
    "COMPLETED": "succeeded",
    "FAILED": "failed",
    "CANCELLED": "failed",
    "PENDING": "pending",
}


class RefundInput(BaseModel):
    """Admin-submitted refund request -- amount None means "refund the
    payment's full remaining balance". client_request_id is REQUIRED
    (not server-minted) so a retry of the same logical action is
    recognized before a second provider call is ever made."""

    model_config = {}

    payment_id: UUID
    amount: Decimal | None = None
    reason: str | None = None
    client_request_id: UUID


def _configure_stripe(cfg: "AppConfig") -> None:
    """Points the stripe-python client at cfg's secret/api_base (test
    doubles set stripe_api_base to fake_stripe.py's local URL)."""
    stripe.api_key = cfg.payment_processor_secret
    if cfg.stripe_api_base:
        stripe.api_base = cfg.stripe_api_base


async def _refunded_so_far(db: "AsyncSession", payment_id: UUID) -> Decimal:
    from melpino_backend.db.models.invoices import Refund

    rows = (
        await db.execute(
            select(Refund).where(
                Refund.payment_id == payment_id, Refund.status == "succeeded"
            )
        )
    ).scalars()
    return sum((r.amount for r in rows), Decimal(0))


async def _reserved_so_far(db: "AsyncSession", payment_id: UUID) -> Decimal:
    """Like _refunded_so_far but also counts still-pending refunds --
    money already claimed against this payment's balance even though it
    hasn't settled yet."""
    from melpino_backend.db.models.invoices import Refund

    rows = (
        await db.execute(
            select(Refund).where(
                Refund.payment_id == payment_id,
                Refund.status.in_(("succeeded", "pending")),
            )
        )
    ).scalars()
    return sum((r.amount for r in rows), Decimal(0))


async def refund_payment(
    db: "AsyncSession",
    cfg: "AppConfig",
    invoice_id: UUID,
    admin_id: UUID,
    refund: RefundInput,
) -> Result[UUID, RefundError | PaymentProviderError]:
    """Issues a refund (full or partial) against one Payment on an
    invoice -- method-aware (stripe -> stripe.Refund.create; paypal with
    a paypal_capture_id -> PayPal refund-capture; anything else is pure
    bookkeeping, the admin already returned the money outside this
    system).

    The invoice row is locked only while validating/computing the
    amount; the lock is released (early commit) before any provider
    network call so a slow/hung provider round-trip never holds a row
    lock. See _record_refund for the short re-locked follow-up write.
    """
    from melpino_backend.db.models.invoices import Payment, Refund

    existing = (
        await db.execute(select(Refund).where(Refund.id == refund.client_request_id))
    ).scalar_one_or_none()
    if existing is not None:
        if (
            existing.payment_id != refund.payment_id
            or existing.invoice_id != invoice_id
        ):
            return Err(RefundError.PaymentNotFound)
        if existing.status == "failed":
            return Err(RefundError.PriorAttemptFailed)
        if existing.status == "succeeded":
            _log.info(
                "refund retry observed already-succeeded refund",
                extra={"refund_id": str(existing.id)},
            )
        return Ok(existing.id)

    invoice = await lock_invoice_for_update(db, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        return Err(RefundError.PaymentNotFound)

    payment = (
        await db.execute(
            select(Payment).where(
                Payment.id == refund.payment_id, Payment.invoice_id == invoice_id
            )
        )
    ).scalar_one_or_none()
    if payment is None:
        return Err(RefundError.PaymentNotFound)
    if payment.status not in ("succeeded", "partially_refunded"):
        return Err(RefundError.PaymentNotRefundable)
    if payment.method == "stripe" and not payment.stripe_payment_intent_id:
        return Err(RefundError.ProviderReferenceMissing)
    if (
        payment.method == "paypal"
        and payment.paypal_order_id
        and not payment.paypal_capture_id
    ):
        return Err(RefundError.ProviderReferenceMissing)

    reserved_so_far = await _reserved_so_far(db, payment.id)
    remaining = payment.amount - reserved_so_far
    amount = refund.amount if refund.amount is not None else remaining
    if amount <= 0:
        return Err(RefundError.InvalidAmount)
    if amount > remaining:
        return Err(RefundError.AmountExceedsBalance)

    currency = invoice.currency
    is_stripe = payment.method == "stripe" and bool(payment.stripe_payment_intent_id)
    is_paypal = payment.method == "paypal" and bool(payment.paypal_capture_id)

    refund_id = refund.client_request_id
    idempotency_key = f"refund:{refund_id}" if (is_stripe or is_paypal) else None

    # Release the invoice row lock before the provider network call --
    # only actually needed when a call is about to happen (stripe/paypal
    # network round-trip); a manual refund never calls a provider at all,
    # so committing/re-locking here would be pure overhead with no
    # benefit for that path.
    if is_stripe or is_paypal:
        await db.commit()

    stripe_refund_id: str | None = None
    paypal_refund_id: str | None = None
    refund_status = "succeeded"

    if is_stripe:
        _configure_stripe(cfg)
        try:
            stripe_refund = await asyncio.to_thread(
                stripe.Refund.create,
                payment_intent=payment.stripe_payment_intent_id,
                amount=to_minor_units(amount, currency),
                idempotency_key=idempotency_key,
            )
        except stripe.error.StripeError as exc:
            _log.error(
                "stripe refund failed",
                extra={"payment_id": str(payment.id)},
                exc_info=exc,
            )
            return Err(PaymentProviderError.RequestFailed)
        stripe_refund_id = stripe_refund["id"]
        refund_status = STRIPE_REFUND_STATUS_MAP.get(
            stripe_refund["status"], "pending"
        )
    elif is_paypal:
        result = await paypal.refund_capture(
            cfg,
            payment.paypal_capture_id,
            amount,
            currency,
            idempotency_key=idempotency_key,
        )
        if result.is_err:
            return Err(result.danger_err)
        paypal_refund_id = result.danger_ok.refund_id
        refund_status = _PAYPAL_REFUND_STATUS_MAP.get(
            result.danger_ok.status, "pending"
        )

    return await _record_refund(
        db,
        cfg=cfg,
        refund_id=refund_id,
        invoice_id=invoice_id,
        payment_id=payment.id,
        admin_id=admin_id,
        amount=amount,
        reason=refund.reason,
        status=refund_status,
        stripe_refund_id=stripe_refund_id,
        paypal_refund_id=paypal_refund_id,
    )


async def _record_refund(
    db: "AsyncSession",
    *,
    cfg: "AppConfig",
    refund_id: UUID,
    invoice_id: UUID,
    payment_id: UUID,
    admin_id: UUID,
    amount: Decimal,
    reason: str | None,
    status: str,
    stripe_refund_id: str | None,
    paypal_refund_id: str | None,
) -> Result[UUID, RefundError | PaymentProviderError]:
    """Short follow-up transaction: re-locks the invoice, re-validates the
    remaining balance for a MANUAL refund only (a provider-backed refund
    already moved real money regardless of what this INSERT does), and
    writes the Refund row."""
    from melpino_backend.db.models.invoices import Payment, Refund

    invoice = await lock_invoice_for_update(db, invoice_id)

    if stripe_refund_id is None and paypal_refund_id is None:
        already_recorded = (
            await db.execute(select(Refund).where(Refund.id == refund_id))
        ).scalar_one_or_none()
        if already_recorded is not None:
            await db.commit()
            return Ok(already_recorded.id)

        reserved_so_far = await _reserved_so_far(db, payment_id)
        payment_row = await db.get(Payment, payment_id)
        remaining = (
            payment_row.amount - reserved_so_far if payment_row is not None else None
        )
        if remaining is not None and amount > remaining:
            await db.commit()
            return Err(RefundError.AmountExceedsBalance)

    try:
        async with db.begin_nested():
            db.add(
                Refund(
                    id=refund_id,
                    payment_id=payment_id,
                    invoice_id=invoice_id,
                    amount=amount,
                    reason=reason,
                    stripe_refund_id=stripe_refund_id,
                    paypal_refund_id=paypal_refund_id,
                    status=status,
                    recorded_by=admin_id,
                )
            )
            await db.flush()
    except IntegrityError:
        # Common case: a retry that reused the same idempotency key got
        # the SAME provider-side refund id back -- the unique index on
        # stripe_refund_id/paypal_refund_id caught the duplicate INSERT.
        existing = None
        if stripe_refund_id is not None:
            existing = (
                await db.execute(
                    select(Refund).where(Refund.stripe_refund_id == stripe_refund_id)
                )
            ).scalar_one_or_none()
        elif paypal_refund_id is not None:
            existing = (
                await db.execute(
                    select(Refund).where(Refund.paypal_refund_id == paypal_refund_id)
                )
            ).scalar_one_or_none()
        await db.commit()
        if existing is not None:
            return Ok(existing.id)
        _log.error(
            "refund row failed to record after a non-duplicate integrity "
            "error; provider refund may be unrecorded, investigate",
            extra={
                "payment_id": str(payment_id),
                "refund_id": str(refund_id),
                "stripe_refund_id": stripe_refund_id,
                "paypal_refund_id": paypal_refund_id,
            },
        )
        return Err(RefundError.RecordingFailed)

    payment = await db.get(Payment, payment_id)
    if status == "succeeded" and payment is not None:
        refunded_so_far = await _refunded_so_far(db, payment_id)
        payment.status = (
            "refunded" if refunded_so_far >= payment.amount else "partially_refunded"
        )
        await db.flush()

        # Invoice-level "refunded" only once total refunds across every
        # payment on the invoice cover the full amount_total.
        if invoice is not None and invoice.status == "paid":
            refund_rows = (
                await db.execute(
                    select(Refund).where(
                        Refund.invoice_id == invoice_id, Refund.status == "succeeded"
                    )
                )
            ).scalars()
            total_refunded_on_invoice = sum(
                (r.amount for r in refund_rows), Decimal(0)
            )
            if total_refunded_on_invoice >= invoice.amount_total:
                invoice.status = "refunded"
                await db.flush()

    await db.commit()

    if status == "succeeded" and invoice is not None:
        # Best-effort settlement notification -- reuses the
        # payment-received template's shape (a refund settled email is
        # low priority per docs/design/05; logging is the durable
        # record).
        _log.info(
            "refund settled invoice_id=%s payment_id=%s amount=%s",
            invoice_id,
            payment_id,
            amount,
        )

    return Ok(refund_id)
