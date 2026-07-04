from __future__ import annotations

# Future one-JSON-object-per-line file formatter -- not wired up yet
# (config.toml only defines stdout/stderr handlers per ~/.claude/refs/logging.md).
# CRIB: logand.app backend/src/logand_backend/logging/json_formatter.py.
import logging


class JsonLineFormatter(logging.Formatter):
    """Will render one JSON object per line for a future file handler."""

    def format(self, record: logging.LogRecord) -> str:
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl): see docs/design/01
