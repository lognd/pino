from __future__ import annotations

# Admin action audit trail -- copied unchanged in shape from logand.app
# per docs/design/03-database.md. CRIB: logand.app
# backend/src/logand_backend/db/models/audit.py.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base


class AdminAuditLog(Base):
    """One row per admin-initiated write, for after-the-fact review.

    `before_state`/`after_state` are full-row JSON snapshots, not just a
    diff -- this is the rollback record, same convention as logand.app's
    AdminAuditLog.
    """

    __tablename__ = "admin_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Nullable + SET NULL (not RESTRICT) -- an audit log entry must
    # survive the admin account that made it being deleted.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    table_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stringified -- primary keys vary in type across tables (uuid here),
    # so this stays a plain string representation rather than trying to
    # type this column per-table.
    row_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    before_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
