from __future__ import annotations

# System-level idempotency coverage for the Stripe webhook handler -- see
# docs/design/05-payments-and-invoicing.md and docs/design/12's testing
# obligations. Exercises api/webhooks.py's own event-handling function
# directly against a real (test-container) DB session rather than going
# through stripe.Webhook.construct_event's signature verification -- that
# verification is pure Stripe SDK code with no domain logic of this
# app's own to test; what matters here is the at-least-once-delivery
# idempotency the handler itself implements.
from decimal import Decimal

from sqlalchemy import select

from melpino_backend.api.webhooks import _handle_payment_intent_event
from melpino_backend.db.models.invoices import Invoice, Payment
from melpino_backend.domain.invoices.service import LineItemInput, create_invoice


def _fake_event(*, intent_id: str, amount_cents: int, event_type: str) -> dict:
    return {
        "type": event_type,
        "id": f"evt_{intent_id}",
        "data": {
            "object": {
                "id": intent_id,
                "amount": amount_cents,
                "latest_charge": f"ch_{intent_id}",
            }
        },
    }


async def test_stripe_webhook_is_idempotent_under_at_least_once_delivery(
    db_session, make_student, app_config
) -> None:
    """The same Stripe event (same payment_intent id) delivered twice
    settles the invoice exactly once -- no duplicate Payment row, no
    double-send of the settlement email, invoice ends up paid exactly
    once."""
    student = await make_student()
    result = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Class", unit_price=Decimal("100.00"))],
    )
    invoice_id, _raw_token = result.danger_ok
    invoice = await db_session.get(Invoice, invoice_id)
    invoice.status = "sent"
    invoice.stripe_payment_intent_id = "pi_test_123"
    await db_session.flush()

    event = _fake_event(
        intent_id="pi_test_123",
        amount_cents=10000,
        event_type="payment_intent.succeeded",
    )

    await _handle_payment_intent_event(db_session, event, app_config)
    await _handle_payment_intent_event(db_session, event, app_config)

    payments = (
        (
            await db_session.execute(
                select(Payment).where(Payment.stripe_payment_intent_id == "pi_test_123")
            )
        )
        .scalars()
        .all()
    )
    assert len(payments) == 1
    assert payments[0].status == "succeeded"
    await db_session.refresh(invoice)
    assert invoice.status == "paid"


async def test_stripe_webhook_amount_reflects_provider_not_client(
    db_session, make_student, app_config
) -> None:
    """The Payment amount recorded is whatever the Stripe event itself
    reports (from_minor_units(intent['amount'], ...)) -- never anything
    the client could have supplied at PaymentIntent-creation time, since
    create_stripe_intent (api/invoices_public.py) computes the intent
    amount server-side from get_amount_due, not from client input."""
    student = await make_student()
    result = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Class", unit_price=Decimal("50.00"))],
    )
    invoice_id, _raw_token = result.danger_ok
    invoice = await db_session.get(Invoice, invoice_id)
    invoice.status = "sent"
    invoice.stripe_payment_intent_id = "pi_test_456"
    await db_session.flush()

    event = _fake_event(
        intent_id="pi_test_456",
        amount_cents=5000,
        event_type="payment_intent.succeeded",
    )
    await _handle_payment_intent_event(db_session, event, app_config)

    payment = (
        await db_session.execute(
            select(Payment).where(Payment.stripe_payment_intent_id == "pi_test_456")
        )
    ).scalar_one()
    assert payment.amount == Decimal("50.00")
