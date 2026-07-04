from __future__ import annotations

# Daily domain sweep -- the pure, unit-testable body the scheduler drives
# (scripts/scheduler.py is a thin sleep-loop around this). See
# docs/design/04-booking-and-scheduling.md's scheduler section:
#   1. send `reminder` emails for sessions starting within
#      reminder_days_before (idempotent via the reminders_sent ledger),
#   2. flip past published/full sessions to 'completed'.
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import update

from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.domain.notifications.notify import send_due_reminders

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig

logger = logging.getLogger(__name__)


async def flip_past_sessions_to_completed(db: "AsyncSession") -> int:
    """Marks every published/full session whose end time is in the past as
    'completed'; returns the number flipped. Idempotent -- a second run
    matches nothing since the rows are no longer published/full."""
    now = datetime.now(timezone.utc)
    stmt = (
        update(ClassSession)
        .where(
            ClassSession.status.in_(("published", "full")),
            ClassSession.ends_at < now,
        )
        .values(status="completed")
    )
    result = await db.execute(stmt)
    # CursorResult.rowcount for an UPDATE -- ty sees the generic Result
    # base type, which doesn't expose it.
    count = result.rowcount or 0  # ty: ignore[unresolved-attribute]
    logger.info("flip_past_sessions_to_completed: %d session(s) completed", count)
    return count


async def run_daily_sweep(db: "AsyncSession", cfg: "AppConfig") -> tuple[int, int]:
    """Runs the whole daily sweep in one transaction (the caller commits):
    returns (reminders_sent, sessions_completed). Safe to re-run -- both
    halves are idempotent (reminders via the ledger, completion via the
    status guard)."""
    logger.info("run_daily_sweep: starting")
    reminders = await send_due_reminders(db, cfg)
    completed = await flip_past_sessions_to_completed(db)
    logger.info(
        "run_daily_sweep: done -- %d reminder(s), %d completed", reminders, completed
    )
    return reminders, completed
