from __future__ import annotations

# Daily loop: reminders + session-status sweeps + PayPal pending-capture
# reconciliation -- see docs/design/04-booking-and-scheduling.md's
# scheduler section. CRIB: logand.app
# backend/src/logand_backend/scripts/scheduler.py (same
# sleep-until-04:00-UTC loop pattern; no system cron since the Docker
# image runs as a non-root user).
import argparse
import asyncio
from datetime import datetime, time, timedelta, timezone

from melpino_backend.app.config import AppConfig
from melpino_backend.db import base as db_base
from melpino_backend.domain.booking.sweep import run_daily_sweep
from melpino_backend.logging.logger import get_logger

log = get_logger(__name__)

_RUN_HOUR_UTC = 4


def seconds_until_next_run(now: datetime, run_hour_utc: int = _RUN_HOUR_UTC) -> float:
    """Pure function (real clock read happens only in main_loop) --
    directly unit-testable."""
    target = datetime.combine(now.date(), time(run_hour_utc, 0), tzinfo=timezone.utc)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def main_loop() -> None:
    """Sends due reminder emails and flips past sessions to 'completed'
    once daily at 04:00 UTC. A plain sleep-until-next-run loop needs no OS
    cron and no elevated user (the Docker image runs as non-root)."""
    while True:
        delay = seconds_until_next_run(datetime.now(timezone.utc))
        log.info("next scheduled sweep in %.0f seconds", delay)
        await asyncio.sleep(delay)
        try:
            cfg = AppConfig.from_external(argparse.Namespace())
            db_base.init_engine(cfg.database_url)
            session = db_base.get_session()
            try:
                reminders, completed, reconciled = await run_daily_sweep(session, cfg)
                await session.commit()
                log.info(
                    "daily sweep complete: %d reminder(s), %d session(s) completed, "
                    "%d paypal capture(s) reconciled",
                    reminders,
                    completed,
                    reconciled,
                )
            finally:
                await session.close()
                await db_base.dispose_engine()
        except Exception:
            # Log and keep looping -- one failed run must not kill the
            # long-running container; it retries at tomorrow's slot.
            log.exception("daily sweep run failed")


if __name__ == "__main__":
    asyncio.run(main_loop())
