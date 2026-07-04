from __future__ import annotations

# Uploaded waiver scans -- see docs/design/03-database.md's `waivers`
# table and docs/design/06-waivers-and-legal.md. PII-dense: private
# storage keys only, never a public URL (see
# docs/design/13-storage-abstraction.md).
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from melpino_backend.db.base import Base

# Doc 03 says "content_type text not null -- allowlist png/jpeg/webp/pdf"
# without pinning down the exact stored string; this CHECK enforces the
# MIME-type form (matching what a real upload's Content-Type header would
# carry, and what domain/waivers/service.py's allowlist check would
# validate against before insert). Flagged in the final report as an
# interpretation of doc 03, not a verbatim quote from it.
_CONTENT_TYPE_CHECK = (
    "content_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')"
)


class Waiver(Base):
    """A student's uploaded waiver file, referenced by storage key."""

    __tablename__ = "waivers"
    __table_args__ = (
        CheckConstraint(_CONTENT_TYPE_CHECK, name="ck_waivers_content_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Optional link -- a waiver isn't always tied to one particular session.
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("class_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    template_version: Mapped[str] = mapped_column(Text, nullable=False)
    # Storage key, see docs/design/13-storage-abstraction.md -- never a
    # public URL.
    file_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_hash: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
