"""initial schema

Revision ID: 0000_initial_schema
Revises:
Create Date: 2026-07-04 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0000_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- copied unchanged in shape from logand.app (see
    # docs/design/03-database.md) --
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role in ('admin', 'staff')", name="ck_users_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("csrf_secret", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("table_name", sa.Text(), nullable=True),
        sa.Column("row_id", sa.Text(), nullable=True),
        sa.Column("before_state", postgresql.JSONB(), nullable=True),
        sa.Column("after_state", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "email_opt_out",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column(
            "opted_out_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    # -- melpino's own (see docs/design/03-database.md) --
    op.create_table(
        "courses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "deposit",
            sa.Numeric(precision=12, scale=2),
            server_default="0",
            nullable=False,
        ),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("default_capacity", sa.Integer(), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind in ('law_cert', 'technique', 'private')", name="ck_courses_kind"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "class_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location_name", sa.Text(), nullable=False),
        sa.Column(
            "location_addr", sa.Text(), server_default="", nullable=False
        ),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.Text(), server_default="draft", nullable=False
        ),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("capacity >= 1", name="ck_class_sessions_capacity"),
        sa.CheckConstraint(
            "status in ('draft', 'published', 'full', 'completed', 'cancelled')",
            name="ck_class_sessions_status",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_class_sessions_status_starts_at",
        "class_sessions",
        ["status", "starts_at"],
    )
    op.create_table(
        "students",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), server_default="", nullable=False),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_students_lower_email",
        "students",
        [sa.text("lower(email)")],
    )

    # -- invoicing (copy logand.app's invoices schema verbatim, per
    # docs/design/03; invoices.customer_id -> student_id and
    # pay_token_hash added, see docs/design/05) --
    op.create_table(
        "invoices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column(
            "amount_total",
            sa.Numeric(precision=12, scale=2),
            server_default="0",
            nullable=False,
        ),
        sa.Column("currency", sa.Text(), server_default="usd", nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "is_recurring",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("recurrence_interval", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("pay_token_hash", sa.Text(), nullable=False),
        sa.Column("stripe_payment_intent_id", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "needs_review",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("needs_review_reason", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status in ('draft', 'sent', 'paid', 'overdue', 'void', 'refunded')",
            name="ck_invoices_status",
        ),
        sa.CheckConstraint(
            "recurrence_interval in ('weekly', 'monthly', 'quarterly', 'yearly') "
            "or recurrence_interval is null",
            name="ck_invoices_recurrence_interval",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["students.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pay_token_hash"),
    )
    op.create_index(
        "uq_invoices_stripe_payment_intent_id",
        "invoices",
        ["stripe_payment_intent_id"],
        unique=True,
        postgresql_where=sa.text("stripe_payment_intent_id IS NOT NULL"),
    )
    op.create_table(
        "invoice_line_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "quantity",
            sa.Numeric(precision=12, scale=3),
            server_default="1",
            nullable=False,
        ),
        sa.Column("unit", sa.Text(), nullable=True),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "quantity > 0", name="ck_invoice_line_items_quantity_positive"
        ),
        sa.CheckConstraint(
            "unit_price >= 0", name="ck_invoice_line_items_unit_price_nonnegative"
        ),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("method", sa.Text(), server_default="stripe", nullable=False),
        sa.Column("stripe_payment_intent_id", sa.Text(), nullable=True),
        sa.Column("paypal_order_id", sa.Text(), nullable=True),
        sa.Column("paypal_capture_id", sa.Text(), nullable=True),
        sa.Column("dispute_status", sa.Text(), nullable=True),
        sa.Column("stripe_dispute_id", sa.Text(), nullable=True),
        sa.Column("recorded_by", sa.UUID(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("transaction_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status in ('pending', 'succeeded', 'failed', 'refunded', "
            "'partially_refunded')",
            name="ck_payments_status",
        ),
        sa.CheckConstraint(
            "method in ('stripe', 'paypal', 'zelle', 'in_person', 'other')",
            name="ck_payments_method",
        ),
        sa.CheckConstraint(
            "dispute_status in ('needs_response', 'under_review', 'won', 'lost') "
            "or dispute_status is null",
            name="ck_payments_dispute_status",
        ),
        sa.CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_payments_stripe_payment_intent_id",
        "payments",
        ["stripe_payment_intent_id"],
        unique=True,
        postgresql_where=sa.text("stripe_payment_intent_id IS NOT NULL"),
    )
    op.create_index(
        "uq_payments_paypal_order_id",
        "payments",
        ["paypal_order_id"],
        unique=True,
        postgresql_where=sa.text("paypal_order_id IS NOT NULL"),
    )
    op.create_index(
        "uq_payments_paypal_capture_id",
        "payments",
        ["paypal_capture_id"],
        unique=True,
        postgresql_where=sa.text("paypal_capture_id IS NOT NULL"),
    )
    op.create_index(
        "uq_payments_stripe_dispute_id",
        "payments",
        ["stripe_dispute_id"],
        unique=True,
        postgresql_where=sa.text("stripe_dispute_id IS NOT NULL"),
    )
    op.create_table(
        "refunds",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("payment_id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("stripe_refund_id", sa.Text(), nullable=True),
        sa.Column("paypal_refund_id", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="succeeded", nullable=False),
        sa.Column("recorded_by", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status in ('pending', 'succeeded', 'failed')", name="ck_refunds_status"
        ),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_refunds_stripe_refund_id",
        "refunds",
        ["stripe_refund_id"],
        unique=True,
        postgresql_where=sa.text("stripe_refund_id IS NOT NULL"),
    )
    op.create_index(
        "uq_refunds_paypal_refund_id",
        "refunds",
        ["paypal_refund_id"],
        unique=True,
        postgresql_where=sa.text("paypal_refund_id IS NOT NULL"),
    )
    op.create_table(
        "payment_proofs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_by", sa.UUID(), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("file_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # -- bookings (see docs/design/03-database.md and doc 04's rebooking-
    # after-cancel wrinkle) --
    op.create_table(
        "bookings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("party_size", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.Text(), server_default="confirmed", nullable=False),
        sa.Column("manage_token_hash", sa.Text(), nullable=False),
        sa.Column("attested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attestation_version", sa.Text(), nullable=False),
        sa.Column(
            "sms_consent", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("invoice_id", sa.UUID(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("party_size >= 1", name="ck_bookings_party_size"),
        sa.CheckConstraint(
            "status in ('confirmed', 'cancelled', 'attended', 'no_show')",
            name="ck_bookings_status",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["class_sessions.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manage_token_hash"),
    )
    # DISCREPANCY vs. doc 03's prose (plain "unique (session_id,
    # student_id)"): doc 04 clarifies cancelled bookings keep their row
    # for audit, and a student must be able to rebook after cancelling --
    # so this is a PARTIAL UNIQUE INDEX scoped to status='confirmed', not
    # a plain UniqueConstraint. See db/models/bookings.py's own docstring
    # for the full note.
    op.create_index(
        "uq_bookings_session_id_student_id_confirmed",
        "bookings",
        ["session_id", "student_id"],
        unique=True,
        postgresql_where=sa.text("status = 'confirmed'"),
    )
    op.create_index(
        "ix_bookings_session_id_confirmed",
        "bookings",
        ["session_id"],
        postgresql_where=sa.text("status = 'confirmed'"),
    )
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("party_size", sa.Integer(), server_default="1", nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["class_sessions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id", "student_id", name="uq_waitlist_entries_session_student"
        ),
    )
    op.create_table(
        "waivers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("template_version", sa.Text(), nullable=False),
        sa.Column("file_key", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("file_hash", sa.Text(), nullable=False),
        sa.Column("uploaded_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "content_type in ('image/png', 'image/jpeg', 'image/webp', "
            "'application/pdf')",
            name="ck_waivers_content_type",
        ),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["session_id"], ["class_sessions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "reminders_sent",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind in ('confirmation', 'reminder', 'waitlist_offer', 'cancellation')",
            name="ck_reminders_sent_kind",
        ),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "booking_id", "kind", name="uq_reminders_sent_booking_kind"
        ),
    )


def downgrade() -> None:
    op.drop_table("reminders_sent")
    op.drop_table("waivers")
    op.drop_table("waitlist_entries")
    op.drop_index("ix_bookings_session_id_confirmed", table_name="bookings")
    op.drop_index(
        "uq_bookings_session_id_student_id_confirmed", table_name="bookings"
    )
    op.drop_table("bookings")
    op.drop_table("payment_proofs")
    op.drop_index("uq_refunds_paypal_refund_id", table_name="refunds")
    op.drop_index("uq_refunds_stripe_refund_id", table_name="refunds")
    op.drop_table("refunds")
    op.drop_index("uq_payments_stripe_dispute_id", table_name="payments")
    op.drop_index("uq_payments_paypal_capture_id", table_name="payments")
    op.drop_index("uq_payments_paypal_order_id", table_name="payments")
    op.drop_index("uq_payments_stripe_payment_intent_id", table_name="payments")
    op.drop_table("payments")
    op.drop_table("invoice_line_items")
    op.drop_index("uq_invoices_stripe_payment_intent_id", table_name="invoices")
    op.drop_table("invoices")
    op.drop_index("ix_students_lower_email", table_name="students")
    op.drop_table("students")
    op.drop_index("ix_class_sessions_status_starts_at", table_name="class_sessions")
    op.drop_table("class_sessions")
    op.drop_table("courses")
    op.drop_table("email_opt_out")
    op.drop_table("admin_audit_log")
    op.drop_table("password_reset_tokens")
    op.drop_table("sessions")
    op.drop_table("users")
