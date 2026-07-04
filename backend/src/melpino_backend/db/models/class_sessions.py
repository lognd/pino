from __future__ import annotations

# A scheduled occurrence of a course -- see docs/design/03-database.md's
# `class_sessions` table. Private 1:1 slots are rows with capacity=1 on a
# course of kind='private' -- no separate appointments table (locked
# decision, see docs/design/04-booking-and-scheduling.md).
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base

_STATUS_CHECK = "status in ('draft', 'published', 'full', 'completed', 'cancelled')"


class ClassSession(Base):
    """A bookable date/time occurrence of a Course, with its own capacity
    and status (draft/published/full/completed/cancelled).

    `status='full'` is DERIVED but stored: flipping it inside the same
    booking transaction lets the public listing query stay a single
    indexed read with no COUNT(*) join -- see
    docs/design/04-booking-and-scheduling.md's capacity.py.
    """

    __tablename__ = "class_sessions"
    __table_args__ = (
        CheckConstraint("capacity >= 1", name="ck_class_sessions_capacity"),
        CheckConstraint(_STATUS_CHECK, name="ck_class_sessions_status"),
        # The public listing query -- see docs/design/03's "Indexes worth
        # declaring up front".
        Index("ix_class_sessions_status_starts_at", "status", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="RESTRICT"),
        nullable=False,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location_name: Mapped[str] = mapped_column(Text, nullable=False)
    location_addr: Mapped[str] = mapped_column(Text, nullable=False, default="")
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    # Admin-only, never shown publicly.
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
