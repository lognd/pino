from __future__ import annotations

# Invoicing/payments tables -- see docs/design/03-database.md ("copy
# logand.app's 04-invoices.md schema verbatim... with ONE change:
# invoices.customer_id becomes invoices.student_id fk -> students, plus a
# pay_token_hash column -- see docs/design/05-payments-and-invoicing.md).
# CRIB: logand.app backend/src/logand_backend/db/models/invoices.py
# (Invoice, InvoiceLineItem, Payment, Refund, PaymentProof).
#
# NOTE: doc 03's table-name list ("invoices / invoice_line_items /
# payments / payment_proofs") does not spell "refunds" out as its own
# bullet, but its instruction is to copy logand.app's invoicing schema
# verbatim -- logand's schema includes a `refunds` table (Payment's
# dispute/refund lifecycle depends on it), and the melpino scaffold stub
# already sketched a Refund model with the same TODO shape. Implemented
# here to match; flagged in the final report as a doc 03 ambiguity, not a
# silent addition.
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base

_INVOICE_STATUS_CHECK = (
    "status in ('draft', 'sent', 'paid', 'overdue', 'void', 'refunded')"
)
_RECURRENCE_CHECK = (
    "recurrence_interval in ('weekly', 'monthly', 'quarterly', 'yearly') "
    "or recurrence_interval is null"
)
_PAYMENT_STATUS_CHECK = (
    "status in ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')"
)
_DISPUTE_STATUS_CHECK = (
    "dispute_status in ('needs_response', 'under_review', 'won', 'lost') "
    "or dispute_status is null"
)
_REFUND_STATUS_CHECK = "status in ('pending', 'succeeded', 'failed')"
_PAYMENT_METHOD_CHECK = "method in ('stripe', 'paypal', 'zelle', 'in_person', 'other')"


class Invoice(Base):
    """A billable invoice against a Student (no customer accounts here) --
    pay-by-link via pay_token_hash, see docs/design/05."""

    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint(_INVOICE_STATUS_CHECK, name="ck_invoices_status"),
        CheckConstraint(_RECURRENCE_CHECK, name="ck_invoices_recurrence_interval"),
        # Partial unique (not a plain UniqueConstraint) -- most invoices
        # never touch Stripe (Zelle/in-person/other), so NULL rows must
        # never collide with each other. Same reasoning as Payment's
        # own stripe_payment_intent_id index below.
        Index(
            "uq_invoices_stripe_payment_intent_id",
            "stripe_payment_intent_id",
            unique=True,
            postgresql_where=text("stripe_payment_intent_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Melpino has no customer accounts -- pay-by-link uses the booking
    # manage token or this invoice's own pay_token_hash (see 05), so this
    # is a Student fk, not a User fk.
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    # Denormalized from invoice_line_items for query speed. Must be
    # recomputed server-side on every write -- never trust client input
    # for this field.
    amount_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    currency: Mapped[str] = mapped_column(Text, nullable=False, default="usd")
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_recurring: Mapped[bool] = mapped_column(nullable=False, default=False)
    recurrence_interval: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # sha256(raw_token) -- pay-by-link token scoped to this invoice, see
    # docs/design/05-payments-and-invoicing.md. Always populated (unlike
    # stripe_payment_intent_id) since every invoice needs a pay link.
    pay_token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set exactly once, at the moment status flips to "paid" -- never
    # touched again after that, even if the invoice is later voided.
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Durable admin-facing signal for a suspected double-collect/
    # overpayment -- never cleared automatically, an admin resolves it
    # out-of-band.
    needs_review: Mapped[bool] = mapped_column(nullable=False, default=False)
    needs_review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InvoiceLineItem(Base):
    """One priced line on an Invoice."""

    __tablename__ = "invoice_line_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_invoice_line_items_quantity_positive"),
        CheckConstraint(
            "unit_price >= 0", name="ck_invoice_line_items_unit_price_nonnegative"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=1)
    # Free-form ("hr", "ea", "ft"...) -- purely display, never used in
    # amount_total math.
    unit: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Payment(Base):
    """A recorded (Stripe/PayPal/Zelle/in_person/other) payment against
    an Invoice."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(_PAYMENT_STATUS_CHECK, name="ck_payments_status"),
        CheckConstraint(_PAYMENT_METHOD_CHECK, name="ck_payments_method"),
        CheckConstraint(_DISPUTE_STATUS_CHECK, name="ck_payments_dispute_status"),
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        Index(
            "uq_payments_stripe_payment_intent_id",
            "stripe_payment_intent_id",
            unique=True,
            postgresql_where=text("stripe_payment_intent_id IS NOT NULL"),
        ),
        Index(
            "uq_payments_paypal_order_id",
            "paypal_order_id",
            unique=True,
            postgresql_where=text("paypal_order_id IS NOT NULL"),
        ),
        Index(
            "uq_payments_paypal_capture_id",
            "paypal_capture_id",
            unique=True,
            postgresql_where=text("paypal_capture_id IS NOT NULL"),
        ),
        Index(
            "uq_payments_stripe_dispute_id",
            "stripe_dispute_id",
            unique=True,
            postgresql_where=text("stripe_dispute_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="RESTRICT"),
        nullable=False,
    )
    method: Mapped[str] = mapped_column(Text, nullable=False, default="stripe")
    # Only ever set for method="stripe" rows.
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Only set for method="paypal" rows created via the real PayPal
    # Orders API -- null for a manually-recorded PayPal payment.
    paypal_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    # PayPal refunds are issued against a CAPTURE id, not the order id.
    paypal_capture_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Both null until a real Stripe charge.dispute.* webhook event lands
    # on this payment's charge.
    dispute_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    stripe_dispute_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which admin recorded this -- only set for manually-recorded
    # payments; null for anything created automatically.
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Free-form reference an admin enters for a manual payment -- never
    # required, never escaped here.
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    transaction_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Refund(Base):
    """One (partial or full) refund issued against a Payment -- its own
    table rather than a counter column, since a single payment can be
    refunded in more than one installment."""

    __tablename__ = "refunds"
    __table_args__ = (
        CheckConstraint(_REFUND_STATUS_CHECK, name="ck_refunds_status"),
        Index(
            "uq_refunds_stripe_refund_id",
            "stripe_refund_id",
            unique=True,
            postgresql_where=text("stripe_refund_id IS NOT NULL"),
        ),
        Index(
            "uq_refunds_paypal_refund_id",
            "paypal_refund_id",
            unique=True,
            postgresql_where=text("paypal_refund_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Denormalized from payment.invoice_id -- lets an admin invoice-detail
    # view fetch every refund for an invoice in one query.
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set only for a refund actually issued through the Stripe/PayPal
    # provider API; both null for a manual-payment refund.
    stripe_refund_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    paypal_refund_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="succeeded")
    # Which admin issued this -- always set; unlike Payment.recorded_by
    # there is no automated path that creates a Refund row.
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PaymentProof(Base):
    """A customer-uploaded screenshot/receipt showing they sent a manual
    payment (Zelle, PayPal-sent-directly, etc.) -- separate from Payment
    since a student can upload proof before an admin has recorded
    anything."""

    __tablename__ = "payment_proofs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Matches the melpino scaffold TODO/logand.app shape exactly: NOT
    # NULL + CASCADE to the admin User who recorded the upload (proof
    # uploads go through the admin tool on the guest's behalf, per
    # docs/design/05 -- there is no guest-facing upload endpoint yet).
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
