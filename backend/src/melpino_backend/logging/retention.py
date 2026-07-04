from __future__ import annotations

# Future exponential-backoff log retention (daily/weekly/monthly
# buckets) for rotated file-handler logs -- not wired up yet (no file
# handler exists in config.toml). CRIB: logand.app
# backend/src/logand_backend/logging/retention.py.
from pathlib import Path

DEFAULT_KEEP_DAILY = 7
DEFAULT_KEEP_WEEKLY = 8
DEFAULT_KEEP_MONTHLY = 12
DEFAULT_HARD_CAP_BYTES = 500 * 1024 * 1024


def prune_logs(
    log_dir: Path,
    base_name: str = "app.log",
    keep_daily: int = DEFAULT_KEEP_DAILY,
    keep_weekly: int = DEFAULT_KEEP_WEEKLY,
    keep_monthly: int = DEFAULT_KEEP_MONTHLY,
    hard_cap_bytes: int = DEFAULT_HARD_CAP_BYTES,
) -> list[Path]:
    """Deletes rotated log files outside the retention schedule and hard cap."""
    raise NotImplementedError(
        "see docs/design/01-backend-architecture.md"
    )  # TODO(impl)
