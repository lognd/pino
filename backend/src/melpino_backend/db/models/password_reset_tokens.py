from __future__ import annotations

# Admin password-reset tokens -- copied unchanged in shape from
# logand.app per docs/design/03-database.md. CRIB: logand.app
# backend/src/logand_backend/db/models/password_reset_tokens.py.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class PasswordResetToken(Base):
    """A single-use, hashed, time-limited admin password-reset token."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # sha256(raw_token), never the raw token itself -- same discipline as
    # sessions.Session.token_hash.
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # None until the token is actually redeemed -- single-use, unlike a
    # session token, so a captured-but-already-used token can never be
    # replayed even within its TTL.
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
