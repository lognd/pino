from __future__ import annotations

# The course catalog -- see docs/design/03-database.md's `courses` table.
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base

_KIND_CHECK = "kind in ('law_cert', 'technique', 'private')"


class Course(Base):
    """What Mel teaches -- law_cert, technique, or private, with pricing."""

    __tablename__ = "courses"
    __table_args__ = (CheckConstraint(_KIND_CHECK, name="ck_courses_kind"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # URL identity, e.g. 'ccw-cert' -- never reused after a course is
    # retired (is_active=False keeps the slug/history intact).
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # 0 = pay in full/in person -- no deposit collected online.
    deposit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    default_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
