from __future__ import annotations

# Per-request correlation id, set by app/app.py's request-logging
# middleware -- see docs/design/01-backend-architecture.md. CRIB: logand.app
# backend/src/logand_backend/logging/request_context.py.
import logging
from contextvars import ContextVar

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def new_request_id() -> str:
    """Mints a fresh short request id."""
    raise NotImplementedError(
        "see docs/design/01-backend-architecture.md"
    )  # TODO(impl)


def set_request_id(value: str | None) -> None:
    """Binds the current request id for this task's contextvar scope."""
    raise NotImplementedError(
        "see docs/design/01-backend-architecture.md"
    )  # TODO(impl)


def get_request_id() -> str | None:
    """Reads the current request id, if any."""
    raise NotImplementedError(
        "see docs/design/01-backend-architecture.md"
    )  # TODO(impl)


class RequestIdFilter(logging.Filter):
    """Will attach the current request id to every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl): see docs/design/01
