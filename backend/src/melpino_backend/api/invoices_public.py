from __future__ import annotations

# Pay-by-link surface -- /pay/{invoice_token}, no customer accounts. See
# docs/design/05-payments-and-invoicing.md. Mirrors logand.app's
# api/invoices_public.py (Stripe PaymentIntent create, PayPal
# create/capture order, GET payment-methods) with invoice-scoped pay
# tokens instead of a customer session.
from fastapi import APIRouter

router = APIRouter(prefix="/api/invoices/pay", tags=["invoices-public"])


@router.get("/{pay_token}")
async def get_invoice_by_pay_token(pay_token: str) -> dict:
    """Pay page data: amount due + configured payment methods."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/{pay_token}/stripe-intent")
async def create_stripe_intent(pay_token: str) -> dict:
    """Creates a Stripe PaymentIntent for this invoice's remaining balance."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/{pay_token}/paypal-order")
async def create_paypal_order(pay_token: str) -> dict:
    """Creates a PayPal order for this invoice's remaining balance."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/{pay_token}/paypal-order/{order_id}/capture")
async def capture_paypal_order(pay_token: str, order_id: str) -> dict:
    """Captures an approved PayPal order."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.get("/payment-methods")
async def get_payment_methods() -> dict:
    """Which of stripe/paypal/zelle are currently configured."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
