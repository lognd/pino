from __future__ import annotations

# Daily loop: reminders + session-status sweeps + PayPal reconciliation
# -- see docs/design/04-booking-and-scheduling.md's scheduler section.
# CRIB: logand.app backend/src/logand_backend/scripts/scheduler.py (same
# sleep-until-04:00-UTC loop pattern; no system cron since the Docker
# image runs as a non-root user).
import asyncio
from datetime import datetime

from melpino_backend.logging.logger import get_logger

log = get_logger(__name__)

_RUN_HOUR_UTC = 4


def seconds_until_next_run(now: datetime, run_hour_utc: int = _RUN_HOUR_UTC) -> float:
    """Pure function (real clock read happens only in main_loop) --
    directly unit-testable."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def main_loop() -> None:
    """Sends due reminder emails, flips past sessions to 'completed', and
    reconciles pending PayPal captures/refunds once daily."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


if __name__ == "__main__":
    asyncio.run(main_loop())
