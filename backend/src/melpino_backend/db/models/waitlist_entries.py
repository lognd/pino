from __future__ import annotations

# Waitlist for a full ClassSession -- see docs/design/03-database.md's
# `waitlist_entries` table and docs/design/04-booking-and-scheduling.md's
# oldest-fits offer logic.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class WaitlistEntry(Base):
    """One student waiting for a seat to free on a full session.

    Offers are NOT exclusive holds (see docs/design/04) -- `notified_at`
    just records that an offer email went out, it is not a reservation.
    """

    __tablename__ = "waitlist_entries"
    __table_args__ = (
        # Plain unique constraint (unlike bookings' partial index) -- doc
        # 03/04's rebooking wrinkle is specific to `bookings`; a waitlist
        # entry has no cancelled/confirmed lifecycle of its own to carve
        # out.
        UniqueConstraint(
            "session_id", "student_id", name="uq_waitlist_entries_session_student"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("class_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
    )
    party_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # None until a freed seat is offered to this entry.
    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
