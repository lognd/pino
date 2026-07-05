from __future__ import annotations

# Session capacity locking -- the one real race in this codebase. See
# docs/design/04-booking-and-scheduling.md: two concurrent bookings for
# the last seat must not both succeed. CRIB pattern: logand.app's
# `lock_invoice_for_update` (backend/src/logand_backend/domain/invoices/
# service.py) -- same SELECT ... FOR UPDATE row-lock discipline, applied
# to class_sessions instead of invoices.
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import func, select

from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.class_sessions import ClassSession

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def lock_session_for_booking(
    db: "AsyncSession", session_id: UUID
) -> "ClassSession | None":
    """SELECT ... FOR UPDATE on the class_sessions row; None if not found.

    Serializes concurrent bookings for the SAME session only -- the row
    lock is held until the caller's transaction commits/rolls back, so a
    second create_booking for the same session blocks here until the
    first finishes, then reads the already-updated seat count.

    `populate_existing=True` is REQUIRED here, not cosmetic (mirrors
    `lock_invoice_for_update`'s doc comment): if this row was already
    loaded (unlocked) into the session's identity map earlier in the
    same request, a FOR UPDATE re-select without `populate_existing`
    would hand back the stale identity-mapped object's pre-lock
    attribute values instead of the freshly-locked row -- silently
    defeating the lock for callers that read the session before locking
    it (see FINDINGS.md L1).
    """
    stmt = (
        select(ClassSession)
        .where(ClassSession.id == session_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    session = (await db.execute(stmt)).scalars().first()
    if session is None:
        logger.info("lock_session_for_booking: session_id=%s not found", session_id)
        return None
    logger.info(
        "lock_session_for_booking: locked session_id=%s status=%s",
        session_id,
        session.status,
    )
    return session


async def seats_taken(db: "AsyncSession", session_id: UUID) -> int:
    """SUM(party_size) over confirmed bookings for a session, inside the lock."""
    stmt = select(func.coalesce(func.sum(Booking.party_size), 0)).where(
        Booking.session_id == session_id, Booking.status == "confirmed"
    )
    total = (await db.execute(stmt)).scalar_one()
    return int(total)
