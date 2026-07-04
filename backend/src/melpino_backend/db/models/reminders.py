from __future__ import annotations

# Idempotency ledger for the reminder/notification scheduler -- see
# docs/design/03-database.md's `reminders_sent` table and
# docs/design/04-booking-and-scheduling.md's scheduler section.
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base

_KIND_CHECK = (
    "kind in ('confirmation', 'reminder', 'waitlist_offer', 'cancellation')"
)


class ReminderSent(Base):
    """Records that a given (booking, kind) notification has already
    fired -- a reminder/confirmation/etc. sends at most once per kind, so
    the daily sweep is safe to re-run (see docs/design/04)."""

    __tablename__ = "reminders_sent"
    __table_args__ = (
        CheckConstraint(_KIND_CHECK, name="ck_reminders_sent_kind"),
        UniqueConstraint("booking_id", "kind", name="uq_reminders_sent_booking_kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
