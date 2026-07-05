from __future__ import annotations

# P4 test gaps -- see TODO.md's "P4 test gaps" line and
# docs/design/05-payments-and-invoicing.md / 12-testing-strategy.md:
# refund replay idempotency, per-route provider-unconfigured 503s,
# route-level pay-token isolation, and the stripe-intent concurrency
# race. CRIB: logand.app's equivalent payment test surface.
import asyncio
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from melpino_backend.api import invoices_public as invoices_public_module
from melpino_backend.db.models.invoices import Invoice, Payment, Refund
from melpino_backend.db.models.students import Student
from melpino_backend.domain.invoices.refunds import RefundInput, refund_payment
from melpino_backend.domain.invoices.service import (
    LineItemInput,
    ManualPaymentInput,
    create_invoice,
    derive_pay_token,
    record_manual_payment,
)


async def _make_sent_invoice(db_session, make_student, app_config, amount: Decimal):
    student = await make_student()
    result = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Class", unit_price=amount)],
    )
    invoice_id, raw_token = result.danger_ok
    invoice = await db_session.get(Invoice, invoice_id)
    invoice.status = "sent"
    await db_session.flush()
    return invoice, raw_token


# --- (1) Refund replay idempotency -----------------------------------


async def test_refund_replay_with_same_request_id_does_not_double_refund(
    db_session, make_student, make_user, app_config
) -> None:
    """Calling refund_payment twice with the SAME client_request_id (a
    retried admin click, or an at-least-once-delivery-style replay) never
    creates a second Refund row and never double-moves the payment
    status past what the first call already achieved."""
    invoice, _ = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("100.00")
    )
    admin = await make_user()
    payment_result = await record_manual_payment(
        db_session,
        invoice.id,
        admin.id,
        ManualPaymentInput(method="zelle", amount=Decimal("100.00")),
    )
    payment_id = payment_result.danger_ok
    invoice_id = invoice.id
    admin_id = admin.id
    request_id = uuid4()

    first = await refund_payment(
        db_session,
        app_config,
        invoice_id,
        admin_id,
        RefundInput(payment_id=payment_id, client_request_id=request_id),
    )
    assert first.is_ok

    second = await refund_payment(
        db_session,
        app_config,
        invoice_id,
        admin_id,
        RefundInput(payment_id=payment_id, client_request_id=request_id),
    )
    assert second.is_ok
    assert second.danger_ok == first.danger_ok

    from sqlalchemy import select

    refunds = (
        (await db_session.execute(select(Refund).where(Refund.id == request_id)))
        .scalars()
        .all()
    )
    assert len(refunds) == 1

    payment = await db_session.get(Payment, payment_id)
    assert payment.status == "refunded"


async def test_refund_replay_with_mismatched_payment_id_is_rejected(
    db_session, make_student, make_user, app_config
) -> None:
    """Reusing a client_request_id against a DIFFERENT payment_id than the
    one it was first recorded against is rejected, not silently treated
    as a fresh refund or a matching replay."""
    invoice, _ = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("100.00")
    )
    admin = await make_user()
    payment_result = await record_manual_payment(
        db_session,
        invoice.id,
        admin.id,
        ManualPaymentInput(method="zelle", amount=Decimal("100.00")),
    )
    payment_id = payment_result.danger_ok
    invoice_id = invoice.id
    admin_id = admin.id
    request_id = uuid4()

    first = await refund_payment(
        db_session,
        app_config,
        invoice_id,
        admin_id,
        RefundInput(payment_id=payment_id, client_request_id=request_id),
    )
    assert first.is_ok

    from melpino_backend.errors import RefundError

    replay_wrong_payment = await refund_payment(
        db_session,
        app_config,
        invoice_id,
        admin_id,
        RefundInput(payment_id=uuid4(), client_request_id=request_id),
    )
    assert replay_wrong_payment.is_err
    assert replay_wrong_payment.danger_err is RefundError.PaymentNotFound


# --- (2) Per-route provider-unconfigured 503s -------------------------


async def test_stripe_intent_route_503s_when_unconfigured(
    db_session, make_student, app_config, monkeypatch
) -> None:
    """POST /api/pay/{token}/stripe-intent with payment_processor_secret
    unset returns a 503 (PaymentProviderError.NotConfigured), never a
    real Stripe call or a 500."""
    unconfigured_cfg = app_config.model_copy(update={"payment_processor_secret": None})
    monkeypatch.setattr(invoices_public_module, "_cfg", unconfigured_cfg)

    invoice, raw_token = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("50.00")
    )

    with pytest.raises(HTTPException) as exc_info:
        await invoices_public_module.create_stripe_intent(raw_token, db=db_session)
    assert exc_info.value.status_code == 503


async def test_paypal_order_route_503s_when_unconfigured(
    db_session, make_student, app_config, monkeypatch
) -> None:
    """POST /api/pay/{token}/paypal-order with no PayPal client
    id/secret configured returns a 503, never a real PayPal call."""
    unconfigured_cfg = app_config.model_copy(
        update={"paypal_client_id": None, "paypal_client_secret": None}
    )
    monkeypatch.setattr(invoices_public_module, "_cfg", unconfigured_cfg)

    invoice, raw_token = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("50.00")
    )

    with pytest.raises(HTTPException) as exc_info:
        await invoices_public_module.create_paypal_order_endpoint(
            raw_token, db=db_session
        )
    assert exc_info.value.status_code == 503


# --- (3) Route-level pay-token isolation ------------------------------


async def test_pay_token_cannot_read_a_different_invoice(
    db_session, make_student, app_config, monkeypatch
) -> None:
    """Invoice A's pay token only ever resolves to invoice A -- it never
    leaks invoice B's amount/status, and it cannot be used to affect
    invoice B even indirectly (each route is scoped purely by the token
    in the URL, not any client-suppliable invoice id)."""
    monkeypatch.setattr(invoices_public_module, "_cfg", app_config)

    invoice_a, token_a = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("10.00")
    )
    invoice_b, token_b = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("999.00")
    )
    assert token_a != token_b

    status_via_a = await invoices_public_module.get_invoice_status(
        token_a, db=db_session
    )
    assert status_via_a["invoice_id"] == str(invoice_a.id)
    assert status_via_a["invoice_id"] != str(invoice_b.id)
    assert status_via_a["amount_total"] == "10.00"


async def test_pay_token_derived_from_wrong_secret_is_rejected(
    db_session, make_student, app_config, monkeypatch
) -> None:
    """A token derived from a DIFFERENT signing secret than the one this
    server is configured with -- e.g. forged, or from a pre-rotation
    secret -- resolves to nothing, a plain 404, never confirming any
    invoice's existence."""
    monkeypatch.setattr(invoices_public_module, "_cfg", app_config)

    invoice_a, _real_token = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("10.00")
    )
    forged_token = derive_pay_token("a-completely-different-secret", invoice_a.id)

    with pytest.raises(HTTPException) as exc_info:
        await invoices_public_module.get_invoice_status(forged_token, db=db_session)
    assert exc_info.value.status_code == 404


# --- (4) stripe-intent concurrency race --------------------------------


async def test_concurrent_stripe_intent_creation_yields_one_intent(
    _pg_url, app_config, monkeypatch
) -> None:
    """Two simultaneous /stripe-intent creations against the SAME invoice
    (double-clicked pay button, two open tabs) never both create a fresh
    Stripe PaymentIntent -- lock_invoice_for_update serializes them onto
    separate connections, and the second caller observes the first
    caller's stripe_payment_intent_id already set and reuses it rather
    than creating a second one."""
    configured_cfg = app_config.model_copy(
        update={
            "payment_processor_secret": "sk_test_fake",
            "stripe_api_base": app_config.stripe_api_base,
        }
    )
    monkeypatch.setattr(invoices_public_module, "_cfg", configured_cfg)

    engine = create_async_engine(_pg_url)
    async with AsyncSession(engine) as setup_session:
        student = Student(
            full_name="Test Student",
            email=f"student-{uuid4().hex[:12]}@example.test",
        )
        setup_session.add(student)
        await setup_session.flush()
        result = await create_invoice(
            setup_session,
            configured_cfg,
            student.id,
            [LineItemInput(description="Class", unit_price=Decimal("75.00"))],
        )
        invoice_id, raw_token = result.danger_ok
        invoice = await setup_session.get(Invoice, invoice_id)
        invoice.status = "sent"
        await setup_session.commit()

    created_intent_ids: set[str] = set()
    intents_by_id: dict[str, dict] = {}
    call_count = 0

    import stripe

    def _fake_intent_create(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        # A synchronous fake standing in for stripe.PaymentIntent.create
        # (run via asyncio.to_thread by the real route, which requires a
        # plain blocking callable, not a coroutine function) -- real
        # infra over mocks isn't practical here since this needs to
        # prove a DB-level serialization property, not Stripe API
        # behavior.
        intent_id = f"pi_race_{call_count}"
        intent = {
            "id": intent_id,
            "client_secret": f"{intent_id}_secret",
            "amount": 7500,
            "status": "requires_payment_method",
        }
        created_intent_ids.add(intent_id)
        intents_by_id[intent_id] = intent
        return intent

    def _fake_intent_retrieve(intent_id, *args, **kwargs):
        # The loser of the row-lock race takes THIS path (an existing
        # stripe_payment_intent_id was already set by the winner) --
        # must also be a plain sync callable for the same to_thread
        # reason as _fake_intent_create.
        return intents_by_id[intent_id]

    monkeypatch.setattr(stripe.PaymentIntent, "create", _fake_intent_create)
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", _fake_intent_retrieve)

    async def _create() -> dict:
        async with AsyncSession(engine) as session:
            return await invoices_public_module.create_stripe_intent(
                raw_token, db=session
            )

    results = await asyncio.gather(_create(), _create())

    # Both calls succeed (the loser reuses, it never errors) and both
    # get back the SAME client_secret -- only one PaymentIntent was ever
    # actually created.
    assert results[0]["client_secret"] == results[1]["client_secret"]
    assert call_count == 1
    assert len(created_intent_ids) == 1

    async with AsyncSession(engine) as check_session:
        invoice = await check_session.get(Invoice, invoice_id)
        assert invoice.stripe_payment_intent_id in created_intent_ids
    await engine.dispose()
