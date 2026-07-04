from __future__ import annotations

# Future size-capped, daily-rotating file handler -- not wired up yet.
# CRIB: logand.app backend/src/logand_backend/logging/handler.py.
import logging
from logging.handlers import TimedRotatingFileHandler


class SizeCappedTimedRotatingFileHandler(TimedRotatingFileHandler):
    """Will rotate daily (UTC) and also force an early rotation past a byte cap."""

    def shouldRollover(self, record: logging.LogRecord) -> bool:  # noqa: N802
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl): see docs/design/01
