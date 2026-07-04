from __future__ import annotations

# CAN-SPAM opt-out ledger -- copied unchanged in shape from logand.app
# per docs/design/03-database.md. CRIB: logand.app
# backend/src/logand_backend/db/models -- logand tracks this as a User
# column; melpino has no student accounts, so this is its own table keyed
# by email instead.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class EmailOptOut(Base):
    """An email address that has unsubscribed from notification emails."""

    __tablename__ = "email_opt_out"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    opted_out_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
