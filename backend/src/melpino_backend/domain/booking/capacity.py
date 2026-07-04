from __future__ import annotations

# Session capacity locking -- the one real race in this codebase. See
# docs/design/04-booking-and-scheduling.md: two concurrent bookings for
# the last seat must not both succeed. CRIB pattern: logand.app's
# `lock_invoice_for_update` (backend/src/logand_backend/domain/invoices/
# service.py) -- same SELECT ... FOR UPDATE row-lock discipline, applied
# to class_sessions instead of invoices.
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.db.models.class_sessions import ClassSession


async def lock_session_for_booking(
    db: "AsyncSession", session_id: UUID
) -> "ClassSession | None":
    """SELECT ... FOR UPDATE on the class_sessions row; None if not found."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def seats_taken(db: "AsyncSession", session_id: UUID) -> int:
    """SUM(party_size) over confirmed bookings for a session, inside the lock."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
