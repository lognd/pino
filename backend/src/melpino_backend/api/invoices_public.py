from __future__ import annotations

# Pay-by-link surface -- /api/pay/{token}, no customer accounts. See
# docs/design/05-payments-and-invoicing.md. Mirrors logand.app's
# api/invoices_public.py (Stripe PaymentIntent create, PayPal
# create/capture order, GET payment-methods) with invoice-scoped pay
# tokens instead of a customer session. CSRF-exempt (see app/app.py) --
# the token itself is the auth, there is no cookie session to CSRF
# against.
#
# NOTE (discrepancy, see final report): doc 05 also asks for a guest
# payment-proof upload here. db/models/invoices.py's PaymentProof.
# uploaded_by is a NOT NULL fk to users.id ("proof uploads go through the
# admin tool on the guest's behalf... there is no guest-facing upload
# endpoint yet" per that model's own doc comment) -- a real guest-facing
# upload would need either a nullable uploaded_by or a schema change,
# out of this pass's scope (shared infra, not something to silently
# alter). Left unimplemented here; domain/invoices/service.py::
# attach_payment_proof exists for the admin tool to call once that
# surface is built.
import argparse
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.db.base import get_db
from melpino_backend.db.models.invoices import Invoice, Payment
from melpino_backend.domain.invoices import service
from melpino_backend.domain.payments import currency
from melpino_backend.domain.payments.providers import paypal
from melpino_backend.errors import InvoiceError, PaymentProviderError
from melpino_backend.logging import get_logger

_log = get_logger(__name__)
router = APIRouter(prefix="/api/pay", tags=["invoices-public"])
_cfg = AppConfig.from_external(argparse.Namespace())


class PaymentMethodsResponse(BaseModel):
    """Which of stripe/paypal/zelle are currently configured."""

    model_config = {}

    stripe: bool
    paypal: bool
    zelle_handle: str | None


class InvoiceStatusResponse(BaseModel):
    """Pay-page data: amount due + invoice status + which methods are
    available."""

    model_config = {}

    invoice_id: str
    status: str
    amount_total: str
    amount_due: str
    currency: str
    payment_methods: PaymentMethodsResponse


def _payment_methods() -> PaymentMethodsResponse:
    return PaymentMethodsResponse(
        stripe=bool(_cfg.payment_processor_secret),
        paypal=paypal.is_configured(_cfg),
        zelle_handle=_cfg.zelle_handle,
    )


async def _resolve_invoice(db: AsyncSession, token: str) -> Invoice:
    """Shared token -> invoice resolution -- any failure is a plain 404,
    never confirming an invoice exists to a guesser."""
    result = await service.find_invoice_by_pay_token(db, token)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    return result.danger_ok


@router.get("/{token}")
async def get_invoice_status(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    """GET /api/pay/{token} -- pay page data: amount due + configured
    payment methods. Token invalid -> 404 (never confirms existence)."""
    invoice = await _resolve_invoice(db, token)
    amount_due = await service.get_amount_due(db, invoice)
    return InvoiceStatusResponse(
        invoice_id=str(invoice.id),
        status=invoice.status,
        amount_total=str(invoice.amount_total),
        amount_due=str(amount_due),
        currency=invoice.currency,
        payment_methods=_payment_methods(),
    ).model_dump()


@router.post("/{token}/payment-methods")
async def check_payment_methods(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    """POST /api/pay/{token}/payment-methods -- availability check scoped
    to a real invoice token (still 404s an invalid token, unlike the
    unauthenticated GET /api/config, which is deliberately fine to leak
    global availability but not per-invoice existence)."""
    await _resolve_invoice(db, token)
    return _payment_methods().model_dump()


@router.post("/{token}/stripe-intent")
async def create_stripe_intent(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Creates a Stripe PaymentIntent for this invoice's remaining
    balance. The webhook (api/webhooks.py), not this endpoint, is what
    records the Payment row and settles the invoice -- this only ever
    hands back a client_secret for the frontend to confirm against.

    Row-locked + idempotent-reuse (CRIB: logand.app's pay_invoice): the
    lock serializes concurrent requests against the SAME invoice, and a
    still-live existing intent is reused rather than re-created -- Stripe
    would happily create as many PaymentIntents as asked, and a guest
    confirming two of them (double-clicked pay button, two open tabs)
    would really be charged twice for one invoice.

    DELIBERATE (see FINDINGS.md L1): the invoice row lock is held across
    the Stripe network round-trip rather than released beforehand the
    way refunds.py releases its lock before a provider call. Releasing
    it here would reopen the exact double-intent race this docstring
    just described -- two concurrent requests would both pass the
    "no existing intent" check before either could observe the other's
    stripe_payment_intent_id, and both would create a fresh PaymentIntent
    (see test_concurrent_stripe_intent_creation_yields_one_intent, which
    pins this serialization as a required property). A slow/hung Stripe
    call pinning this row's lock for its duration is the accepted
    tradeoff for a guest-facing, low-volume pay-by-link surface."""
    import asyncio

    import stripe

    resolved = await _resolve_invoice(db, token)
    invoice = await service.lock_invoice_for_update(db, resolved.id)
    if invoice is None:
        raise to_http_exception(InvoiceError.NotFound)
    if invoice.status not in ("sent", "overdue"):
        raise to_http_exception(InvoiceError.InvalidState)
    if not _cfg.payment_processor_secret:
        raise to_http_exception(PaymentProviderError.NotConfigured)
    if await service.has_pending_payment(db, invoice.id):
        raise to_http_exception(InvoiceError.PaymentPending)

    amount_due = await service.get_amount_due(db, invoice)
    if amount_due <= 0:
        raise to_http_exception(InvoiceError.InvalidState)

    # NOTE: card data never touches this server -- Stripe PaymentIntents
    # handles capture entirely on Stripe's side.
    stripe.api_key = _cfg.payment_processor_secret
    if _cfg.stripe_api_base:
        stripe.api_base = _cfg.stripe_api_base

    try:
        # Idempotent resume: a previous call already created a still-live
        # intent (reloaded pay page, retried request) -> reuse it.
        # stripe-python calls are synchronous (blocking socket I/O) --
        # asyncio.to_thread so a slow Stripe round trip doesn't stall
        # every other concurrent request on this process.
        if invoice.stripe_payment_intent_id:
            existing_intent = await asyncio.to_thread(
                stripe.PaymentIntent.retrieve, invoice.stripe_payment_intent_id
            )
            if existing_intent["status"] == "succeeded":
                # Already paid on Stripe's side -- the webhook hasn't
                # landed yet or is about to. A SECOND intent here could be
                # confirmed too, charging twice; refuse instead.
                raise to_http_exception(InvoiceError.InvalidState)
            if existing_intent["status"] != "canceled":
                expected_minor = currency.to_minor_units(amount_due, invoice.currency)
                if existing_intent["amount"] == expected_minor:
                    _log.info(
                        "stripe intent reused invoice_id=%s intent_id=%s",
                        invoice.id,
                        existing_intent["id"],
                    )
                    return {"client_secret": existing_intent["client_secret"]}
                # Amount due changed since the intent was created (another
                # payment landed, an admin edit) -- cancel the stale
                # intent and fall through to a fresh one.
                await asyncio.to_thread(
                    stripe.PaymentIntent.cancel, existing_intent["id"]
                )

        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=currency.to_minor_units(amount_due, invoice.currency),
            currency=invoice.currency,
            metadata={"invoice_id": str(invoice.id)},
        )
    except stripe.error.StripeError as exc:
        _log.error(
            "stripe payment intent creation failed",
            extra={"invoice_id": str(invoice.id)},
            exc_info=exc,
        )
        raise to_http_exception(PaymentProviderError.RequestFailed) from exc
    invoice.stripe_payment_intent_id = intent["id"]
    client_secret = intent["client_secret"]
    intent_id = intent["id"]
    # Capture before commit. The sessionmaker sets expire_on_commit=False
    # (db/base.py), so this isn't currently needed to avoid an
    # expired-attribute lazy-load -- it's defensive against that flag ever
    # being flipped back to SQLAlchemy's default, which would expire ORM
    # attributes on commit and make a bare attribute access afterward
    # lazy-load outside the greenlet context this AsyncSession requires
    # for I/O.
    invoice_id_str = str(invoice.id)
    await db.commit()
    _log.info(
        "stripe intent created invoice_id=%s intent_id=%s",
        invoice_id_str,
        intent_id,
    )
    return {"client_secret": client_secret}


@router.post("/{token}/paypal-order")
async def create_paypal_order_endpoint(
    token: str, db: AsyncSession = Depends(get_db)
) -> dict:
    """Creates a PayPal order for this invoice's remaining balance."""
    invoice = await _resolve_invoice(db, token)
    if invoice.status not in ("sent", "overdue"):
        raise to_http_exception(InvoiceError.InvalidState)
    if await service.has_pending_payment(db, invoice.id):
        raise to_http_exception(InvoiceError.PaymentPending)

    amount_due = await service.get_amount_due(db, invoice)
    pay_url = service.pay_url_for(_cfg, token)
    result = await paypal.create_order(
        _cfg, str(invoice.id), amount_due, invoice.currency, pay_url
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    order = result.danger_ok
    _log.info(
        "paypal order created invoice_id=%s order_id=%s", invoice.id, order.order_id
    )
    return {"order_id": order.order_id, "approval_url": order.approval_url}


@router.post("/{token}/paypal-order/{order_id}/capture")
async def capture_paypal_order_endpoint(
    token: str, order_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    """Captures an approved PayPal order and records the resulting
    Payment -- rejects a capture whose reference_id doesn't match THIS
    invoice (see paypal.PayPalCapture's own doc comment: never trust the
    client-supplied order_id belongs to the invoice URL it was posted
    to).

    DELIBERATE (see FINDINGS.md L1): like create_stripe_intent, this
    holds the invoice row lock across the PayPal capture network call
    instead of releasing it first the way refunds.py does -- the
    has_pending_payment / status guards above only prevent a second
    capture from *starting* concurrently; they don't protect a capture
    already in flight when nothing else is serializing writes to this
    invoice's Payment rows. A slow/hung PayPal call pinning this row's
    lock for its duration is the accepted tradeoff here, same reasoning
    as create_stripe_intent."""
    invoice = await service.lock_invoice_for_update(
        db, (await _resolve_invoice(db, token)).id
    )
    if invoice is None:
        raise to_http_exception(InvoiceError.NotFound)
    if invoice.status not in ("sent", "overdue"):
        # Same guard create_stripe_intent / create_paypal_order_endpoint
        # apply -- without it, a capture can land on an invoice already
        # settled by another method (has_pending_payment alone doesn't
        # catch that, since the other payment is succeeded, not pending),
        # recording a real double-collect.
        raise to_http_exception(InvoiceError.InvalidState)
    if await service.has_pending_payment(db, invoice.id):
        raise to_http_exception(InvoiceError.PaymentPending)

    idempotency_key = f"capture:{invoice.id}:{order_id}"
    result = await paypal.capture_order(_cfg, order_id, idempotency_key)
    if result.is_err:
        await db.rollback()
        raise to_http_exception(result.danger_err)
    capture = result.danger_ok
    if capture.reference_id != str(invoice.id):
        _log.warning(
            "paypal capture reference_id mismatch -- refusing to record",
            extra={
                "invoice_id": str(invoice.id),
                "order_id": order_id,
                "reference_id": capture.reference_id,
            },
        )
        await db.rollback()
        raise to_http_exception(InvoiceError.NotOwned)
    if capture.captured_currency.lower() != invoice.currency.lower():
        # PayPal-side currency auto-conversion or anomaly -- recording this
        # capture's amount as if it were invoice.currency would silently
        # corrupt get_paid_so_far's raw-sum math (see FINDINGS.md L2).
        _log.warning(
            "paypal capture currency mismatch -- refusing to record",
            extra={
                "invoice_id": str(invoice.id),
                "order_id": order_id,
                "invoice_currency": invoice.currency,
                "captured_currency": capture.captured_currency,
            },
        )
        await db.rollback()
        raise to_http_exception(InvoiceError.AmountMismatch)

    payment_status = "succeeded" if capture.status == "COMPLETED" else "pending"
    try:
        # A SAVEPOINT, not a bare flush -- mirrors webhooks.py's Stripe
        # Payment insert. A partial capture (invoice stays "sent"/
        # "overdue", so the status guard above doesn't reject it) followed
        # by a client retry replays the SAME paypal_capture_id (PayPal's
        # idempotency_key dedupes it), which would otherwise hit
        # uq_payments_paypal_capture_id and 500 the request instead of
        # completing as a no-op.
        async with db.begin_nested():
            db.add(
                Payment(
                    id=uuid.uuid4(),
                    invoice_id=invoice.id,
                    method="paypal",
                    paypal_order_id=order_id,
                    paypal_capture_id=capture.capture_id,
                    amount=capture.captured_amount,
                    status=payment_status,
                )
            )
            await db.flush()
    except IntegrityError:
        # Another concurrent/retried request for this exact capture_id
        # already recorded the Payment -- re-read it and report its
        # status idempotently instead of erroring.
        existing_stmt = select(Payment).where(
            Payment.paypal_capture_id == capture.capture_id
        )
        existing = (await db.execute(existing_stmt)).scalar_one()
        await db.commit()
        _log.info(
            "paypal capture already recorded -- idempotent no-op",
            extra={
                "invoice_id": str(invoice.id),
                "paypal_capture_id": capture.capture_id,
            },
        )
        return {"status": existing.status}
    if payment_status == "succeeded":
        paid_so_far = await service.get_paid_so_far(db, invoice)
        if paid_so_far > invoice.amount_total:
            _log.warning(
                "paypal capture overpays invoice; recorded anyway, "
                "needs follow-up/refund",
                extra={"invoice_id": str(invoice.id)},
            )
            await service.flag_invoice_needs_review(
                db,
                invoice,
                f"paypal capture overpays invoice (paid_so_far={paid_so_far})",
            )
        await service.settle_invoice_if_paid(db, invoice)
    await db.commit()
    if payment_status == "succeeded":
        from melpino_backend.domain.notifications.notify import (
            notify_payment_received,
        )

        # Re-load after commit. The sessionmaker sets
        # expire_on_commit=False (db/base.py), so this refresh isn't
        # currently needed to avoid an expired-attribute lazy-load -- it's
        # defensive against that flag ever being flipped back to
        # SQLAlchemy's default, which would expire ORM attributes on
        # commit; notify reads invoice.student_id/id/currency, and a bare
        # access would then sync-lazy-load outside the greenlet context.
        await db.refresh(invoice)
        await notify_payment_received(db, _cfg, invoice, capture.captured_amount)
    return {"status": payment_status}
