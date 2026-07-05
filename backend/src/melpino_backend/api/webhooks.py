from __future__ import annotations

# Stripe webhooks -- signature auth, CSRF-exempt (see app/app.py). See
# docs/design/05-payments-and-invoicing.md. CRIB: logand.app
# backend/src/logand_backend/api/webhooks.py (idempotent handling under
# at-least-once delivery) -- payment_intent.succeeded/.payment_failed
# copied verbatim in shape. Dispute/refund-updated webhook handling is
# NOT copied in this pass (out of scope for the deposit-journey gate;
# see final report) -- domain/invoices/refunds.py's own refund flow still
# works via the synchronous stripe.Refund.create path either way.
import argparse

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.app.config import AppConfig
from melpino_backend.db.base import get_db
from melpino_backend.db.models.invoices import Invoice, Payment
from melpino_backend.domain.invoices.service import (
    flag_invoice_needs_review,
    get_paid_so_far,
    has_pending_payment,
    settle_invoice_if_paid,
)
from melpino_backend.domain.notifications.notify import notify_payment_received
from melpino_backend.domain.payments.currency import from_minor_units
from melpino_backend.logging import get_logger

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
_log = get_logger(__name__)


@router.post("/stripe")
async def stripe_webhook(
    request: Request, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    """Verifies the Stripe signature, then handles payment_intent.succeeded/
    .payment_failed idempotently. NOTE: no session/CSRF auth here by
    design -- Stripe signature verification IS the auth for this route
    (see app/app.py's CSRF-exempt prefix list); do not add require_admin
    or csrf checks."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if sig_header is None:
        _log.warning("stripe webhook rejected: missing stripe-signature header")
        raise HTTPException(status_code=400, detail="missing stripe-signature header")

    cfg = AppConfig.from_external(argparse.Namespace())
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, cfg.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        _log.warning("stripe webhook rejected: bad signature", exc_info=exc)
        raise HTTPException(
            status_code=400, detail="invalid webhook signature"
        ) from exc

    _log.info(
        "stripe webhook received",
        extra={
            "event_type": event["type"],
            "event_id": event["id"] if "id" in event else None,
        },
    )
    if event["type"] in ("payment_intent.succeeded", "payment_intent.payment_failed"):
        await _handle_payment_intent_event(db, event, cfg)
    else:
        _log.info(
            "stripe webhook: unhandled event type, ignoring",
            extra={"event_type": event["type"]},
        )

    return {"status": "received"}


async def _flag_if_paypal_pending_race(db: AsyncSession, invoice: Invoice) -> None:
    """A Stripe PaymentIntent can succeed while a PayPal capture is still
    PENDING on the SAME invoice -- there is no has_pending_payment guard
    possible at webhook-delivery time (the charge already happened on
    Stripe's side). Escalate beyond a log line by persisting a durable
    needs-review flag."""
    if await has_pending_payment(db, invoice.id):
        _log.warning(
            "stripe payment succeeded while a paypal capture is still "
            "pending on this invoice -- possible double-collect, "
            "flagging for admin review",
            extra={"invoice_id": str(invoice.id)},
        )
        await flag_invoice_needs_review(
            db,
            invoice,
            "stripe payment succeeded while a paypal capture was still "
            "pending on this invoice",
        )


async def _flag_if_already_covered(db: AsyncSession, invoice: Invoice) -> None:
    """A Stripe payment landing on an invoice already fully covered by an
    earlier succeeded payment is a silent no-op from
    settle_invoice_if_paid's perspective -- flag it so the double-collect
    surfaces somewhere. Call AFTER the Payment row is flushed/updated so
    get_paid_so_far's sum includes it."""
    paid_so_far = await get_paid_so_far(db, invoice)
    if paid_so_far > invoice.amount_total:
        _log.warning(
            "stripe payment landed on an invoice already covered by "
            "other payments -- possible double-collect, flagging for "
            "admin review",
            extra={
                "invoice_id": str(invoice.id),
                "paid_so_far": str(paid_so_far),
                "amount_total": str(invoice.amount_total),
            },
        )
        await flag_invoice_needs_review(
            db,
            invoice,
            "stripe payment landed on an already-covered invoice "
            f"(paid_so_far={paid_so_far}, amount_total={invoice.amount_total})",
        )


async def _handle_payment_intent_event(
    db: AsyncSession, event: dict, cfg: AppConfig
) -> None:
    """Idempotent under Stripe's at-least-once webhook delivery: keyed on
    stripe_payment_intent_id, with a unique-index-backed INSERT race
    handled via IntegrityError -> no-op (someone else already recorded
    this delivery)."""
    intent = event["data"]["object"]
    intent_id = intent["id"]
    succeeded = event["type"] == "payment_intent.succeeded"

    invoice = (
        await db.execute(
            select(Invoice)
            .where(Invoice.stripe_payment_intent_id == intent_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if invoice is None:
        _log.warning(
            "stripe webhook: no invoice matches this payment intent",
            extra={"stripe_payment_intent_id": intent_id},
        )
        return

    existing = (
        await db.execute(
            select(Payment).where(Payment.stripe_payment_intent_id == intent_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if not succeeded and existing.status == "succeeded":
            # A late/out-of-order payment_failed for an intent that
            # already has a succeeded Payment must never downgrade it --
            # Stripe does not guarantee delivery order.
            _log.info(
                "stripe webhook: ignoring late payment_failed for an "
                "already-succeeded intent",
                extra={
                    "invoice_id": str(invoice.id),
                    "stripe_payment_intent_id": intent_id,
                },
            )
            return
        existing.status = "succeeded" if succeeded else "failed"
        await db.flush()
        if succeeded:
            await _flag_if_paypal_pending_race(db, invoice)
        settled_now = succeeded and await settle_invoice_if_paid(db, invoice)
        if succeeded:
            await _flag_if_already_covered(db, invoice)
        if succeeded and invoice.status == "paid" and settled_now:
            _log.info(
                "invoice marked paid via stripe (retried intent)",
                extra={
                    "invoice_id": str(invoice.id),
                    "stripe_payment_intent_id": intent_id,
                },
            )
            # Capture what the email needs BEFORE commit -- commit()
            # expires every attribute on `invoice`/`existing`, and a bare
            # (unawaited) attribute access afterward would try to
            # lazy-load synchronously and crash outside the greenlet
            # context this AsyncSession requires for I/O.
            paid_amount = existing.amount
            # Release the invoice row lock before the email send.
            await db.commit()
            await notify_payment_received(db, cfg, invoice, paid_amount)
            return
        await db.commit()
        return

    try:
        # A SAVEPOINT, not a bare flush -- if the unique-index race fires,
        # only this failed INSERT rolls back, not the whole request.
        async with db.begin_nested():
            db.add(
                Payment(
                    invoice_id=invoice.id,
                    stripe_payment_intent_id=intent_id,
                    amount=from_minor_units(intent["amount"], invoice.currency),
                    status="succeeded" if succeeded else "failed",
                    transaction_id=intent["latest_charge"]
                    if "latest_charge" in intent
                    else None,
                )
            )
            await db.flush()
    except IntegrityError:
        # Another concurrent delivery for this exact intent_id already
        # inserted its Payment row -- nothing left for this delivery.
        return

    if succeeded:
        await _flag_if_paypal_pending_race(db, invoice)
        await settle_invoice_if_paid(db, invoice)
        await _flag_if_already_covered(db, invoice)
        _log.info(
            "invoice marked paid via stripe",
            extra={
                "invoice_id": str(invoice.id),
                "stripe_payment_intent_id": intent_id,
            },
        )
        # Same capture-before-commit reasoning as the "existing Payment"
        # branch above.
        paid_amount = from_minor_units(intent["amount"], invoice.currency)
        await db.commit()
        await notify_payment_received(db, cfg, invoice, paid_amount)
        return
    _log.warning(
        "stripe payment_intent failed",
        extra={"invoice_id": str(invoice.id), "stripe_payment_intent_id": intent_id},
    )
    await db.flush()
