from __future__ import annotations

# A real local SMTP server (aiosmtpd) for system tests that need to
# assert on an actual sent email (subject, body, attachments, headers) --
# see docs/design/04-booking-and-scheduling.md's system-test obligations.
# CRIB: logand.app backend/src/logand_backend/testing/fake_smtp.py.
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from email.message import Message


class _CapturingHandler:
    """aiosmtpd message handler that appends every received message to a list."""

    def __init__(self) -> None:
        self.messages: list["Message"] = []


def start_fake_smtp_server(host: str = "127.0.0.1", port: int = 0) -> tuple[str, int]:
    """Starts a local aiosmtpd controller; returns (host, bound_port)."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def stop_fake_smtp_server() -> None:
    """Stops the controller started by start_fake_smtp_server."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
