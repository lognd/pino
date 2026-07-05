from __future__ import annotations

# Integration coverage for Stripe/PayPal/manual payments and refunds --
# see docs/design/05-payments-and-invoicing.md.
import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from melpino_backend.db.models.invoices import Invoice, Payment
from melpino_backend.domain.invoices.refunds import RefundInput, refund_payment
from melpino_backend.domain.invoices.service import (
    LineItemInput,
    ManualPaymentInput,
    create_invoice,
    get_paid_so_far,
    invoice_unpaid_bookings_for_session,
    record_manual_payment,
)
from melpino_backend.domain.payments.providers import paypal
from melpino_backend.errors import InvoiceError, PaymentProviderError, RefundError


async def _make_sent_invoice(
    db_session, make_student, app_config, amount: Decimal
) -> Invoice:
    student = await make_student()
    result = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Class", unit_price=amount)],
    )
    invoice_id, _raw_token = result.danger_ok
    invoice = await db_session.get(Invoice, invoice_id)
    invoice.status = "sent"
    await db_session.flush()
    return invoice


async def test_manual_payment_recording(
    db_session, make_student, make_user, app_config
) -> None:
    """record_manual_payment settles an invoice when the full amount is
    recorded."""
    invoice = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("100.00")
    )
    admin = await make_user()

    result = await record_manual_payment(
        db_session,
        invoice.id,
        admin.id,
        ManualPaymentInput(
            method="zelle", amount=Decimal("100.00"), client_request_id=uuid4()
        ),
    )
    assert result.is_ok
    await db_session.refresh(invoice)
    assert invoice.status == "paid"
    assert invoice.paid_at is not None


async def test_manual_payment_partial_leaves_invoice_payable(
    db_session, make_student, make_user, app_config
) -> None:
    """A partial manual payment records but does not settle the invoice."""
    invoice = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("100.00")
    )
    admin = await make_user()

    result = await record_manual_payment(
        db_session,
        invoice.id,
        admin.id,
        ManualPaymentInput(
            method="zelle", amount=Decimal("40.00"), client_request_id=uuid4()
        ),
    )
    assert result.is_ok
    await db_session.refresh(invoice)
    assert invoice.status == "sent"
    assert await get_paid_so_far(db_session, invoice) == Decimal("40.00")


async def test_manual_payment_on_draft_invoice_is_rejected(
    db_session, make_student, make_user, app_config
) -> None:
    """A draft invoice (never sent) cannot receive a payment."""
    student = await make_student()
    admin = await make_user()
    result = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Class", unit_price=Decimal("50.00"))],
    )
    invoice_id, _raw_token = result.danger_ok

    payment_result = await record_manual_payment(
        db_session,
        invoice_id,
        admin.id,
        ManualPaymentInput(
            method="zelle", amount=Decimal("50.00"), client_request_id=uuid4()
        ),
    )
    assert payment_result.is_err
    assert payment_result.danger_err is InvoiceError.InvalidState


async def test_refund_amount_exceeding_balance_is_rejected(
    db_session, make_student, make_user, app_config
) -> None:
    """A refund larger than the payment's remaining balance returns
    AmountExceedsBalance."""
    invoice = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("100.00")
    )
    admin = await make_user()
    payment_result = await record_manual_payment(
        db_session,
        invoice.id,
        admin.id,
        ManualPaymentInput(
            method="zelle", amount=Decimal("100.00"), client_request_id=uuid4()
        ),
    )
    payment_id = payment_result.danger_ok

    result = await refund_payment(
        db_session,
        app_config,
        invoice.id,
        admin.id,
        RefundInput(
            payment_id=payment_id,
            amount=Decimal("500.00"),
            client_request_id=uuid4(),
        ),
    )
    assert result.is_err
    assert result.danger_err is RefundError.AmountExceedsBalance


async def test_refund_manual_payment_in_full(
    db_session, make_student, make_user, app_config
) -> None:
    """A full manual refund records a Refund row and flips the Payment to
    refunded (and the invoice to refunded, since it covers the full
    total)."""
    invoice = await _make_sent_invoice(
        db_session, make_student, app_config, Decimal("100.00")
    )
    admin = await make_user()
    payment_result = await record_manual_payment(
        db_session,
        invoice.id,
        admin.id,
        ManualPaymentInput(
            method="zelle", amount=Decimal("100.00"), client_request_id=uuid4()
        ),
    )
    payment_id = payment_result.danger_ok
    await db_session.refresh(invoice)
    assert invoice.status == "paid"

    result = await refund_payment(
        db_session,
        app_config,
        invoice.id,
        admin.id,
        RefundInput(payment_id=payment_id, client_request_id=uuid4()),
    )
    assert result.is_ok
    payment = await db_session.get(Payment, payment_id)
    assert payment.status == "refunded"
    await db_session.refresh(invoice)
    assert invoice.status == "refunded"


async def test_unconfigured_provider_returns_not_configured() -> None:
    """A PayPal call against an unconfigured provider returns
    NotConfigured (api/errors.py maps this to 503) -- never a real
    network call."""
    from melpino_backend.app.config import AppConfig

    cfg = AppConfig(session_secret="test-only-secret")  # paypal fields unset
    assert not paypal.is_configured(cfg)
    result = await paypal.create_order(
        cfg, "inv-1", Decimal("10.00"), "usd", "https://x.test/pay/tok"
    )
    assert result.is_err
    assert result.danger_err is PaymentProviderError.NotConfigured


async def test_concurrent_double_pay_is_serialized_by_row_lock(
    _pg_url, app_config
) -> None:
    """Two concurrent manual-payment attempts against the SAME invoice,
    each covering the full amount, never both succeed -- lock_invoice_
    for_update serializes them onto separate connections, so whichever
    one runs second observes the invoice already flipped to "paid" by
    the first (InvoiceError.InvalidState) instead of both racing past
    the same "sent" read and double-recording a payment (a lost-update
    double-collect)."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from melpino_backend.db.models.students import Student
    from melpino_backend.db.models.users import User

    engine = create_async_engine(_pg_url)
    async with AsyncSession(engine) as setup_session:
        student = Student(
            full_name="Test Student",
            email=f"student-{uuid4().hex[:12]}@example.test",
        )
        admin = User(
            email=f"admin-{uuid4().hex[:12]}@example.test",
            password_hash="x" * 32,
            role="admin",
        )
        setup_session.add_all([student, admin])
        await setup_session.flush()
        admin_id = admin.id
        result = await create_invoice(
            setup_session,
            app_config,
            student.id,
            [LineItemInput(description="Class", unit_price=Decimal("100.00"))],
        )
        invoice_id, _raw_token = result.danger_ok
        invoice = await setup_session.get(Invoice, invoice_id)
        invoice.status = "sent"
        await setup_session.commit()

    async def _pay() -> object:
        async with AsyncSession(engine) as session:
            outcome = await record_manual_payment(
                session,
                invoice_id,
                admin_id,
                ManualPaymentInput(
                    method="zelle", amount=Decimal("100.00"), client_request_id=uuid4()
                ),
            )
            await session.commit()
            return outcome

    results = await asyncio.gather(_pay(), _pay())
    succeeded = [r for r in results if r.is_ok]
    failed = [r for r in results if r.is_err]
    assert len(succeeded) == 1
    assert len(failed) == 1
    assert failed[0].danger_err is InvoiceError.InvalidState
    async with AsyncSession(engine) as check_session:
        invoice = await check_session.get(Invoice, invoice_id)
        paid = await get_paid_so_far(check_session, invoice)
        assert paid == Decimal("100.00")
        assert invoice.status == "paid"
    await engine.dispose()


async def test_invoice_unpaid_endpoint_skips_already_paid_bookings(
    db_session, make_class_session, make_student, app_config
) -> None:
    """invoice_unpaid_bookings_for_session only creates invoices for
    confirmed bookings that have no invoice_id yet -- a booking that
    already has one (regardless of that invoice's own paid/unpaid
    status) is skipped, matching the bulk action's own "this is an admin
    decision, not this action's job" doc comment."""
    from melpino_backend.db.models.bookings import Booking

    class_session = await make_class_session()
    student_a = await make_student()
    student_b = await make_student()

    # student_b already has a real linked invoice -- must be skipped.
    existing_invoice_result = await create_invoice(
        db_session,
        app_config,
        student_b.id,
        [LineItemInput(description="Already invoiced", unit_price=Decimal("10.00"))],
    )
    existing_invoice_id, _raw_token = existing_invoice_result.danger_ok

    now = datetime.now(timezone.utc)
    booking_unpaid = Booking(
        session_id=class_session.id,
        student_id=student_a.id,
        party_size=1,
        status="confirmed",
        manage_token_hash=uuid4().hex + uuid4().hex,
        attested_at=now,
        attestation_version="test-v1",
    )
    booking_already_invoiced = Booking(
        session_id=class_session.id,
        student_id=student_b.id,
        party_size=1,
        status="confirmed",
        manage_token_hash=uuid4().hex + uuid4().hex,
        invoice_id=existing_invoice_id,
        attested_at=now,
        attestation_version="test-v1",
    )
    db_session.add_all([booking_unpaid, booking_already_invoiced])
    await db_session.flush()

    created = await invoice_unpaid_bookings_for_session(
        db_session, app_config, class_session.id
    )
    assert len(created) == 1
    await db_session.refresh(booking_unpaid)
    assert booking_unpaid.invoice_id == created[0].id
