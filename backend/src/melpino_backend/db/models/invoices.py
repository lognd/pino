from __future__ import annotations

# Invoicing/payments tables -- see docs/design/03-database.md ("copy
# logand.app's 04-invoices.md schema verbatim... with ONE change:
# invoices.customer_id becomes invoices.student_id, and a pay_token_hash
# column is added per docs/design/05-payments-and-invoicing.md"). CRIB:
# logand.app backend/src/logand_backend/db/models/invoices.py (Invoice,
# InvoiceLineItem, Payment, Refund, PaymentProof).
from melpino_backend.db.base import Base


class Invoice(Base):
    """A billable invoice against a Student (no customer accounts here) --
    pay-by-link via pay_token_hash, see docs/design/05."""

    __tablename__ = "invoices"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03/05 -- id, student_id fk
    # restrict, status check, amount_total, currency, memo, is_recurring,
    # recurrence_interval, due_date, pay_token_hash unique,
    # stripe_payment_intent_id unique partial, paid_at, needs_review,
    # needs_review_reason, deleted_at, created_at/updated_at


class InvoiceLineItem(Base):
    """One priced line on an Invoice."""

    __tablename__ = "invoice_line_items"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, invoice_id fk cascade,
    # description, quantity check (>0), unit, unit_price check (>=0),
    # created_at


class Payment(Base):
    """A recorded (Stripe/PayPal/Zelle/in_person/other) payment against an Invoice."""

    __tablename__ = "payments"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, invoice_id fk
    # restrict, method check, stripe_payment_intent_id unique partial,
    # paypal_order_id/paypal_capture_id unique partial,
    # dispute_status/stripe_dispute_id, recorded_by fk set null, note,
    # amount check (>0), status check, transaction_id, created_at


class Refund(Base):
    """A (partial or full) refund issued against a Payment -- see
    docs/design/01's RefundError for the failure modes this must support."""

    __tablename__ = "refunds"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, payment_id fk
    # restrict, invoice_id fk restrict (denormalized), amount, reason,
    # stripe_refund_id/paypal_refund_id unique partial, status check,
    # recorded_by fk restrict, created_at


class PaymentProof(Base):
    """A customer-uploaded proof-of-payment screenshot/receipt."""

    __tablename__ = "payment_proofs"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, invoice_id fk cascade,
    # uploaded_by fk cascade, file_path, content_type, file_hash, created_at
