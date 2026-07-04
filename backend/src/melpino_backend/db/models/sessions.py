from __future__ import annotations

# Admin auth sessions -- see docs/design/02-auth-and-security.md. CRIB:
# logand.app backend/src/logand_backend/db/models/sessions.py.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class Session(Base):
    """A server-side admin session row (token_hash, csrf_secret, expiry)."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # sha256(raw_token), never the raw token itself -- see
    # docs/design/02-auth-and-security.md.
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    csrf_secret: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
