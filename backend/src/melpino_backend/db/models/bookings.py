from __future__ import annotations

# A guest booking against a ClassSession -- see
# docs/design/03-database.md's `bookings` table and
# docs/design/04-booking-and-scheduling.md's state machine.
#
# DISCREPANCY (documented per instruction, see 04's own note): doc 03's
# DDL sketch says a plain `unique (session_id, student_id)` constraint
# ("DuplicateBooking backstop"). Doc 04 clarifies this is wrong as
# written -- cancelled bookings keep their row for audit, and a student
# must be able to rebook a session after cancelling. The real required
# behavior is uniqueness only among status='confirmed' rows, so this is
# implemented as a PARTIAL UNIQUE INDEX (postgresql_where
# status='confirmed'), NOT the plain UniqueConstraint doc 03's prose
# describes. See migration 0000_initial_schema.py for the matching DDL.
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base

_STATUS_CHECK = "status in ('confirmed', 'cancelled', 'attended', 'no_show')"


class Booking(Base):
    """One guest's confirmed/cancelled/attended/no_show booking, keyed to
    a manage_token_hash (see docs/design/02-auth-and-security.md)."""

    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("party_size >= 1", name="ck_bookings_party_size"),
        CheckConstraint(_STATUS_CHECK, name="ck_bookings_status"),
        # PARTIAL unique index, not a plain unique constraint -- see the
        # module docstring's DISCREPANCY note. A student can rebook the
        # same session after cancelling; only one *confirmed* booking per
        # (session, student) may exist at a time.
        Index(
            "uq_bookings_session_id_student_id_confirmed",
            "session_id",
            "student_id",
            unique=True,
            postgresql_where=text("status = 'confirmed'"),
        ),
        # Roster + capacity checks -- see docs/design/03's "Indexes worth
        # declaring up front".
        Index(
            "ix_bookings_session_id_confirmed",
            "session_id",
            postgresql_where=text("status = 'confirmed'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("class_sessions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="RESTRICT"),
        nullable=False,
    )
    party_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="confirmed")
    # manage_token_hash's own uniqueness (SHA-256, see 02) is separate
    # from the session/student partial index above -- unique=True here is
    # a plain constraint since this column is always populated and truly
    # global-unique regardless of status.
    manage_token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    # Eligibility checkbox -- see docs/design/06-waivers-and-legal.md.
    attested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    attestation_version: Mapped[str] = mapped_column(Text, nullable=False)
    # TCPA consent -- captured now even though SMS is out of scope for v1
    # (see docs/design/04's scheduler section).
    sms_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set when payment involved -- null for a pay-in-person booking with
    # no deposit due.
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
