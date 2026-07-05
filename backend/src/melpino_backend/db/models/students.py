from __future__ import annotations

# A person who has ever booked/attended -- see docs/design/03-database.md's
# `students` table. Deduped on (lower(email), lower(full_name)) at booking
# time by domain/students/service.py; no DOB/SSN/license numbers, ever
# (see docs/design/02-auth-and-security.md and 06-waivers-and-legal.md).
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class Student(Base):
    """A booker/attendee -- name, email, phone, admin-only notes.

    `email` is deliberately NOT unique -- households book together and
    share an inbox; dedup happens in the booking-time service layer, not
    at the schema level.
    """

    __tablename__ = "students"
    __table_args__ = (
        # Dedup lookup -- see docs/design/03's "Indexes worth declaring
        # up front".
        Index("ix_students_lower_email", text("lower(email)")),
        # Enforces the dedup key at the schema level so two concurrent
        # find_or_create_student calls for the SAME new person (different
        # sessions booked in parallel tabs, no shared row lock) cannot
        # both slip past the SELECT and insert duplicate rows -- see
        # FINDINGS.md L2. The service catches the resulting IntegrityError
        # and re-selects the winner's row.
        Index(
            "uq_students_lower_email_lower_full_name",
            text("lower(email)"),
            text("lower(full_name)"),
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Admin-only, never shown publicly.
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
