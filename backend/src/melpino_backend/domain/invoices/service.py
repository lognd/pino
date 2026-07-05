from __future__ import annotations

# Invoice creation/payment recording/pay-token lookup -- see
# docs/design/05-payments-and-invoicing.md. CRIB: logand.app
# backend/src/logand_backend/domain/invoices/service.py -- row-lock
# discipline (`lock_invoice_for_update`), get_paid_so_far/
# settle_invoice_if_paid, manual-payment recording all copied verbatim in
# shape; melpino's deltas are pay-by-link (pay_token_hash, no customer
# accounts) and deposit-on-booking auto-creation.
import base64
import hashlib
import hmac
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from typani.result import Err, Ok, Result

from melpino_backend.domain.payments import currency
from melpino_backend.domain.payments.providers import paypal
from melpino_backend.errors import InvoiceError
from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig
    from melpino_backend.db.models.invoices import Invoice

_log = get_logger(__name__)

# Every method an admin can record BY HAND -- "stripe" is deliberately
# excluded (only ever created automatically from a real Stripe webhook)
# and so is a real PayPal-API capture (paypal.py creates its own Payment
# row once that's hooked up via the pay-by-link surface). "paypal" here
# means "the student already sent a PayPal payment some other way and an
# admin is just recording it," distinguished by paypal_order_id being
# null.
ManualPaymentMethod = Literal["paypal", "zelle", "in_person", "other"]


class ManualPaymentInput(BaseModel):
    """Admin-entered manual payment fields. client_request_id is REQUIRED
    (not server-minted), mirroring domain/invoices/refunds.py's
    RefundInput -- a double-submitted/retried manual payment (double-
    click, client retry, proxy replay) is recognized before a second
    Payment row is ever inserted."""

    model_config = {}

    method: ManualPaymentMethod
    amount: Decimal = Field(gt=0)
    note: str | None = None
    client_request_id: UUID


class LineItemInput(BaseModel):
    """One line item to create on a new invoice."""

    model_config = {}

    description: str
    quantity: Decimal = Field(default=Decimal(1), gt=0)
    unit_price: Decimal = Field(ge=0)
    unit: str | None = None


def derive_pay_token(secret: str, invoice_id: UUID) -> str:
    """Deterministically derives invoice_id's 256-bit pay-by-link token:
    HMAC-SHA256(secret, invoice id), urlsafe-base64. STABLE for the
    invoice's whole life -- doc 02's token semantics require an emailed
    /pay/{token} link to keep working, and doc 05 requires the booking
    manage page to link to the same pay page later -- yet the raw value is
    still never persisted (only its hash is, see hash_pay_token): any
    surface that needs the link after creation just re-derives it from
    the signing secret. Rotating that secret is the deliberate, global
    revocation lever (see pay_link_for_invoice's re-key path)."""
    digest = hmac.new(
        secret.encode("utf-8"),
        b"invoice-pay-token:" + invoice_id.bytes,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def hash_pay_token(raw_token: str) -> str:
    """sha256 hex digest of a raw pay token -- the only form ever
    persisted (invoices.pay_token_hash)."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def pay_url_for(cfg: "AppConfig", raw_token: str) -> str:
    """Absolute pay-by-link URL built from public_base_url -- the raw
    token lives only here and in the invoice email/PDF."""
    return f"{cfg.public_base_url}/pay/{raw_token}"


async def lock_invoice_for_update(
    db: "AsyncSession", invoice_id: UUID
) -> "Invoice | None":
    """SELECT ... FOR UPDATE on the invoice row -- every read-then-act
    invoice operation locks the row first, serializing two concurrent
    requests against the SAME invoice (a double-clicked pay button, a
    retried webhook overlapping an admin's manual-payment recording)
    without taking any lock on OTHER invoices.

    populate_existing=True is REQUIRED here, not cosmetic: a caller that
    already loaded this same invoice earlier in the SAME session (e.g.
    api/invoices_public.py's _resolve_invoice, an unlocked read) leaves it
    in the session's identity map. Without populate_existing, SQLAlchemy
    returns that already-identity-mapped Python object's EXISTING
    (pre-lock) attribute values rather than the row this FOR UPDATE just
    (re-)fetched after waiting out a concurrent holder's commit -- found
    via a concurrency test that reproduced two simultaneous
    /stripe-intent creations both reading stripe_payment_intent_id=None
    and both creating a fresh Stripe PaymentIntent, exactly the
    double-charge this lock exists to prevent. See TODO.md's P4 test
    gaps and tests/integration/test_payments_p4_gaps.py."""
    from melpino_backend.db.models.invoices import Invoice

    return (
        await db.execute(
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def recompute_amount_total(db: "AsyncSession", invoice_id: UUID) -> Decimal:
    """Sums invoice_line_items for invoice_id and writes it back to
    invoices.amount_total in the same transaction -- amount_total must
    never be trusted from client input."""
    from melpino_backend.db.models.invoices import Invoice, InvoiceLineItem

    invoice = await db.get(Invoice, invoice_id)
    if invoice is None:
        return Decimal(0)

    line_items = (
        await db.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)
        )
    ).scalars()
    total = sum(
        (
            currency.quantize_to_currency(li.quantity * li.unit_price, invoice.currency)
            for li in line_items
        ),
        Decimal(0),
    )
    invoice.amount_total = total
    await db.flush()
    return total


async def create_invoice(
    db: "AsyncSession",
    cfg: "AppConfig",
    student_id: UUID,
    line_items: list[LineItemInput],
    memo: str | None = None,
) -> Result[tuple[UUID, str], InvoiceError]:
    """Creates a draft invoice for a student with the given line items --
    derives its stable pay-by-link token immediately (every invoice needs
    one, per docs/design/05). Returns (invoice_id, raw_pay_token)."""
    from melpino_backend.db.models.invoices import Invoice, InvoiceLineItem

    invoice_id = uuid4()
    raw_token = derive_pay_token(cfg.session_secret, invoice_id)
    token_hash = hash_pay_token(raw_token)
    invoice = Invoice(
        id=invoice_id,
        student_id=student_id,
        memo=memo,
        status="draft",
        pay_token_hash=token_hash,
    )
    db.add(invoice)
    # Flush now so the model's `currency` column default ("usd") is
    # actually populated on the instance before line items quantize
    # against it.
    await db.flush()
    for item in line_items:
        db.add(
            InvoiceLineItem(
                id=uuid4(),
                invoice_id=invoice_id,
                description=item.description,
                quantity=item.quantity,
                unit_price=currency.quantize_to_currency(
                    item.unit_price, invoice.currency
                ),
                unit=item.unit,
            )
        )
    await db.flush()
    await recompute_amount_total(db, invoice_id)
    _log.info("create_invoice: invoice_id=%s student_id=%s", invoice_id, student_id)
    return Ok((invoice_id, raw_token))


async def create_deposit_invoice(
    db: "AsyncSession",
    cfg: "AppConfig",
    *,
    student_id: UUID,
    booking_id: UUID,
    course_title: str,
    course_deposit: Decimal,
    party_size: int,
) -> tuple["Invoice", str]:
    """Auto-creates a "Deposit -- {course.title}" invoice (amount =
    deposit * party_size), immediately sent (not left in draft, since a
    guest must be able to pay it right away). Caller is responsible for
    linking bookings.invoice_id. Returns (invoice, raw_pay_token)."""
    from melpino_backend.db.models.invoices import Invoice

    result = await create_invoice(
        db,
        cfg,
        student_id,
        [
            LineItemInput(
                description=f"Deposit -- {course_title}",
                quantity=Decimal(party_size),
                unit_price=course_deposit,
            )
        ],
        memo=f"Deposit for booking {booking_id}",
    )
    # create_invoice only fails on impossible states (bad line items),
    # which the deposit math above can never produce -- Ok is assumed.
    invoice_id, raw_token = result.danger_ok
    invoice = await db.get(Invoice, invoice_id)
    assert invoice is not None
    invoice.status = "sent"
    await db.flush()
    _log.info(
        "create_deposit_invoice: invoice_id=%s booking_id=%s amount=%s",
        invoice_id,
        booking_id,
        invoice.amount_total,
    )
    return invoice, raw_token


async def has_pending_payment(db: "AsyncSession", invoice_id: UUID) -> bool:
    """True if a Payment row for invoice_id is currently 'pending' (a
    PayPal capture held for review) -- callers must check this before
    letting a second payment start."""
    from melpino_backend.db.models.invoices import Payment

    existing = (
        await db.execute(
            select(Payment.id).where(
                Payment.invoice_id == invoice_id, Payment.status == "pending"
            )
        )
    ).scalar_one_or_none()
    return existing is not None


async def flag_invoice_needs_review(
    db: "AsyncSession", invoice: "Invoice", reason: str
) -> None:
    """Persists a durable, admin-facing "needs review" signal on invoice
    -- called from every place that detects a suspected double-collect/
    overpayment."""
    invoice.needs_review = True
    invoice.needs_review_reason = reason
    await db.flush()


async def record_manual_payment(
    db: "AsyncSession",
    invoice_id: UUID,
    admin_id: UUID,
    payment: ManualPaymentInput,
) -> Result[UUID, InvoiceError]:
    """Records a payment an admin observed happening OUTSIDE this system
    -- Zelle, cash, a PayPal payment sent directly, or anything else that
    isn't the Stripe/PayPal pay-by-link flow. Marks the invoice paid only
    once recorded payments cover amount_total."""
    from melpino_backend.db.models.invoices import Payment

    payment_id = payment.client_request_id
    existing = await db.get(Payment, payment_id)
    if existing is not None:
        if existing.invoice_id != invoice_id:
            return Err(InvoiceError.NotFound)
        _log.info(
            "record_manual_payment retry observed already-recorded payment",
            extra={"invoice_id": str(invoice_id), "payment_id": str(payment_id)},
        )
        return Ok(existing.id)

    invoice = await lock_invoice_for_update(db, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        return Err(InvoiceError.NotFound)
    if invoice.status not in ("sent", "overdue"):
        return Err(InvoiceError.InvalidState)
    if await has_pending_payment(db, invoice_id):
        return Err(InvoiceError.PaymentPending)

    try:
        # A SAVEPOINT, not a bare flush -- mirrors refunds.py/webhooks.py:
        # a concurrent retry racing us to insert the SAME client_request_id
        # rolls back only this INSERT, not the whole request.
        async with db.begin_nested():
            db.add(
                Payment(
                    id=payment_id,
                    invoice_id=invoice_id,
                    method=payment.method,
                    amount=payment.amount,
                    status="succeeded",
                    recorded_by=admin_id,
                    note=payment.note,
                )
            )
            await db.flush()
    except IntegrityError:
        existing = await db.get(Payment, payment_id)
        if existing is not None:
            return Ok(existing.id)
        raise
    await settle_invoice_if_paid(db, invoice)
    _log.info(
        "record_manual_payment: invoice_id=%s payment_id=%s method=%s amount=%s",
        invoice_id,
        payment_id,
        payment.method,
        payment.amount,
    )
    return Ok(payment_id)


async def get_paid_so_far(db: "AsyncSession", invoice: "Invoice") -> Decimal:
    """Sums the net amount still credited from every succeeded or
    partially-refunded Payment recorded against invoice."""
    from melpino_backend.db.models.invoices import Payment, Refund

    refunded_by_payment = (
        select(
            Refund.payment_id.label("payment_id"),
            func.sum(Refund.amount).label("refunded"),
        )
        .where(Refund.status == "succeeded")
        .group_by(Refund.payment_id)
        .subquery()
    )
    net_paid = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        Payment.amount
                        - func.coalesce(refunded_by_payment.c.refunded, 0)
                    ),
                    0,
                )
            )
            .select_from(Payment)
            .outerjoin(
                refunded_by_payment,
                refunded_by_payment.c.payment_id == Payment.id,
            )
            .where(
                Payment.invoice_id == invoice.id,
                Payment.status.in_(("succeeded", "partially_refunded")),
            )
        )
    ).scalar_one()
    return Decimal(net_paid)


async def get_amount_due(db: "AsyncSession", invoice: "Invoice") -> Decimal:
    """Outstanding remainder on invoice: amount_total minus every
    succeeded payment recorded so far, floored at zero."""
    paid_so_far = await get_paid_so_far(db, invoice)
    remainder = invoice.amount_total - paid_so_far
    return remainder if remainder > 0 else Decimal(0)


async def settle_invoice_if_paid(db: "AsyncSession", invoice: "Invoice") -> bool:
    """Marks invoice 'paid' once its succeeded payments cover
    amount_total. Idempotent -- a no-op if already paid or still short.
    Returns True iff this call is what flipped it."""
    if invoice.status == "paid":
        return False
    paid_so_far = await get_paid_so_far(db, invoice)
    if paid_so_far >= invoice.amount_total:
        invoice.status = "paid"
        invoice.paid_at = datetime.now(timezone.utc)
        await db.flush()
        _log.info("settle_invoice_if_paid: invoice_id=%s -> paid", invoice.id)
        return True
    return False


async def pay_link_for_invoice(
    db: "AsyncSession", cfg: "AppConfig", invoice: "Invoice"
) -> str | None:
    """Returns invoice's pay-by-link URL by RE-DERIVING its stable token
    (derive_pay_token is deterministic, so every surface that needs the
    link after creation -- the manage page, an admin re-send, the
    confirmation screen -- hands out the SAME link the invoice email
    carried). None for a soft-deleted invoice.

    Re-key path: if the derived token's hash no longer matches the stored
    pay_token_hash, the signing secret was rotated since this invoice was
    created -- that rotation is the deliberate, global revocation lever
    (every previously-issued link dies at once). This helper heals the
    invoice forward by overwriting the stored hash with the new
    derivation, so links handed out AFTER the rotation work again while
    everything issued before it stays dead."""
    if invoice.deleted_at is not None:
        return None
    raw_token = derive_pay_token(cfg.session_secret, invoice.id)
    token_hash = hash_pay_token(raw_token)
    if invoice.pay_token_hash != token_hash:
        _log.info(
            "pay_link_for_invoice: re-keying invoice_id=%s after "
            "signing-secret rotation",
            invoice.id,
        )
        invoice.pay_token_hash = token_hash
        await db.flush()
    return pay_url_for(cfg, raw_token)


async def find_invoice_by_pay_token(
    db: "AsyncSession", raw_token: str
) -> Result["Invoice", InvoiceError]:
    """Pay-by-link lookup -- same mint/hash/404 semantics as booking
    manage tokens: any failure (wrong token, invoice not found, soft
    deleted) is InvoiceError.NotFound, never a distinct status, so a
    guessed token never confirms an invoice exists."""
    from melpino_backend.db.models.invoices import Invoice

    token_hash = hash_pay_token(raw_token)
    invoice = (
        await db.execute(
            select(Invoice).where(
                Invoice.pay_token_hash == token_hash, Invoice.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if invoice is None:
        _log.info("pay token lookup failed: no matching hash")
        return Err(InvoiceError.NotFound)
    _log.info("pay token lookup succeeded invoice_id=%s", invoice.id)
    return Ok(invoice)


async def invoice_unpaid_bookings_for_session(
    db: "AsyncSession", cfg: "AppConfig", session_id: UUID
) -> list["Invoice"]:
    """Admin: generates one invoice per still-unpaid booking on a session
    ("invoice everyone still unpaid for Saturday's class"). Skips a
    booking that already has a linked invoice_id (re-invoicing an
    already-invoiced booking is an admin decision this bulk action
    deliberately does not make) and skips non-confirmed bookings."""
    from melpino_backend.db.models.bookings import Booking
    from melpino_backend.db.models.class_sessions import ClassSession
    from melpino_backend.db.models.courses import Course
    from melpino_backend.db.models.invoices import Invoice

    session = await db.get(ClassSession, session_id)
    if session is None:
        _log.info(
            "invoice_unpaid_bookings_for_session: session_id=%s not found", session_id
        )
        return []
    course = await db.get(Course, session.course_id)
    assert course is not None  # FK RESTRICT: a session's course always exists

    stmt = select(Booking).where(
        Booking.session_id == session_id,
        Booking.status == "confirmed",
        Booking.invoice_id.is_(None),
    )
    bookings = (await db.execute(stmt)).scalars().all()

    created: list[Invoice] = []
    for booking in bookings:
        result = await create_invoice(
            db,
            cfg,
            booking.student_id,
            [
                LineItemInput(
                    description=course.title,
                    quantity=Decimal(booking.party_size),
                    unit_price=course.price,
                )
            ],
            memo=f"Invoice for booking {booking.id}",
        )
        invoice_id, _raw_token = result.danger_ok
        invoice = await db.get(Invoice, invoice_id)
        assert invoice is not None
        invoice.status = "sent"
        booking.invoice_id = invoice.id
        await db.flush()
        created.append(invoice)
        _log.info(
            "invoice_unpaid_bookings_for_session: booking_id=%s -> invoice_id=%s",
            booking.id,
            invoice.id,
        )
    _log.info(
        "invoice_unpaid_bookings_for_session: session_id=%s created %d invoice(s)",
        session_id,
        len(created),
    )
    return created


async def reconcile_pending_paypal_captures(
    db: "AsyncSession", cfg: "AppConfig"
) -> int:
    """Polls any Payment recorded 'pending' via PayPal for real
    settlement -- PayPal delivers no webhook for capture completion.
    Returns the number of payments transitioned out of 'pending'."""
    from melpino_backend.db.models.invoices import Invoice, Payment
    from melpino_backend.domain.notifications import notify

    if not paypal.is_configured(cfg):
        return 0

    pending_ids = (
        (
            await db.execute(
                select(Payment.id).where(
                    Payment.method == "paypal",
                    Payment.status == "pending",
                    Payment.paypal_order_id.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )

    settled_count = 0
    for payment_id in pending_ids:
        payment = (
            await db.execute(
                select(Payment).where(Payment.id == payment_id).with_for_update()
            )
        ).scalar_one_or_none()
        if (
            payment is None
            or payment.status != "pending"
            or payment.paypal_order_id is None
        ):
            continue

        result = await paypal.get_order_status(cfg, payment.paypal_order_id)
        if result.is_err:
            _log.warning(
                "paypal capture reconciliation: status check failed",
                extra={"payment_id": str(payment.id)},
            )
            await db.commit()
            continue

        capture = result.danger_ok
        if capture.status == "PENDING":
            await db.commit()
            continue
        if capture.status != "COMPLETED":
            payment.status = "failed"
            await db.flush()
            await db.commit()
            settled_count += 1
            continue

        payment.status = "succeeded"
        await db.flush()

        invoice = (
            await db.execute(
                select(Invoice)
                .where(Invoice.id == payment.invoice_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if invoice is not None:
            paid_so_far = await get_paid_so_far(db, invoice)
            if paid_so_far > invoice.amount_total:
                _log.warning(
                    "paypal reconciled capture overpays invoice; "
                    "recorded anyway, needs follow-up/refund",
                    extra={
                        "invoice_id": str(invoice.id),
                        "payment_id": str(payment.id),
                    },
                )
                await flag_invoice_needs_review(
                    db,
                    invoice,
                    "paypal reconciled capture overpays invoice "
                    f"(paid_so_far={paid_so_far}, amount_total={invoice.amount_total})",
                )
            await settle_invoice_if_paid(db, invoice)
            # Capture before commit -- commit() expires ORM attributes,
            # and a bare access afterward would sync-lazy-load outside
            # the greenlet context this AsyncSession requires for I/O.
            paid_amount = payment.amount
            await db.commit()
            await db.refresh(invoice)
            await notify.notify_payment_received(db, cfg, invoice, paid_amount)
        else:
            await db.commit()
        settled_count += 1

    return settled_count


async def attach_payment_proof(
    db: "AsyncSession",
    invoice_id: UUID,
    uploaded_by: UUID,
    file_bytes: bytes,
    file_path: str,
    content_type: str,
) -> Result[UUID, InvoiceError]:
    """A screenshot/receipt showing a manual payment was sent --
    deliberately NOT gated on invoice status the way record_manual_payment
    is: uploaded hoping to speed up an admin marking the invoice paid, so
    it must work for a sent/overdue invoice. Only draft/void invoices
    (never payable in the first place) reject it."""
    import hashlib

    from melpino_backend.db.models.invoices import Invoice, PaymentProof

    invoice = await db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        return Err(InvoiceError.NotFound)
    if invoice.status in ("draft", "void"):
        return Err(InvoiceError.InvalidState)

    file_hash = hashlib.sha256(file_bytes).hexdigest()
    proof_id = uuid4()
    db.add(
        PaymentProof(
            id=proof_id,
            invoice_id=invoice_id,
            uploaded_by=uploaded_by,
            file_path=file_path,
            content_type=content_type,
            file_hash=file_hash,
        )
    )
    await db.flush()
    _log.info("attach_payment_proof: invoice_id=%s proof_id=%s", invoice_id, proof_id)
    return Ok(proof_id)
