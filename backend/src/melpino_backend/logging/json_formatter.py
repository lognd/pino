from __future__ import annotations

import json
import logging
from datetime import datetime, timezone


class JsonLineFormatter(logging.Formatter):
    """One JSON object per line -- the file handler's format, not stdout's
    (stdout/stderr stay human-readable via MalmbergFormatter for a developer
    watching a terminal). JSON so the on-disk log is directly grep/jq-able
    and so a log-aggregation tool could ingest it later without a custom
    parser.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "module": record.module,
            "line": record.lineno,
        }
        # Anything passed via logger.info("...", extra={...}) rides along
        # so it stays individually queryable instead of being stuffed into
        # the message string.
        for key, value in record.__dict__.items():
            if key in _RESERVED or key in payload:
                continue
            try:
                json.dumps(value)
            except TypeError:
                value = repr(value)
            payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_RESERVED = frozenset(
    {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "taskName",
        "getMessage",
    }
)
