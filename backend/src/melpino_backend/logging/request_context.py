from __future__ import annotations

# Per-request correlation id, set by app/app.py's request-logging
# middleware -- see docs/design/01-backend-architecture.md.
import logging
import uuid
from contextvars import ContextVar

# One request id per inbound HTTP request, set at the very start of request
# handling and cleared at the end. A ContextVar (not a module global)
# because uvicorn serves requests concurrently on the same event loop -- a
# plain global would leak one request's id into another's log lines under
# real concurrent traffic.
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def new_request_id() -> str:
    """Mints a fresh short request id."""
    return uuid.uuid4().hex[:16]


def set_request_id(value: str | None) -> None:
    """Binds the current request id for this task's contextvar scope."""
    _request_id.set(value)


def get_request_id() -> str | None:
    """Reads the current request id, if any."""
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Attaches the current request id (if any) to every log record so a
    crash report can be grepped straight from a request id the frontend
    hands back -- JsonLineFormatter reads record.request_id.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True
