from __future__ import annotations

# Admin/staff user accounts -- see docs/design/03-database.md. CRIB:
# logand.app backend/src/logand_backend/db/models/users.py (adds a
# role in ('admin','staff') check instead of logand's ('admin','customer'),
# since melpino has no customer accounts at all).
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class User(Base):
    """An admin/staff account -- see docs/design/02-auth-and-security.md's
    authorization model (admin, staff)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role in ('admin', 'staff')", name="ck_users_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    # None = active (the default for every existing/new account). Set to a
    # real timestamp to deactivate -- checked at login so a disabled
    # account genuinely can't authenticate, same convention as
    # logand.app's User.disabled_at.
    disabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
