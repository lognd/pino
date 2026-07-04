from __future__ import annotations

# A real local SMTP server (aiosmtpd) for system tests that need to
# assert on an actual sent email (subject, body, attachments, headers) --
# see docs/design/04-booking-and-scheduling.md's system-test obligations.
# CRIB: logand.app backend/src/logand_backend/testing/fake_smtp.py -- the
# real code in domain/notifications/mailer.py runs its actual smtplib.SMTP
# client against this (EHLO/MAIL FROM/RCPT TO/DATA), not a mock.
#
# TLS is deliberately NOT offered here -- AppConfig.smtp_use_tls must be
# False for tests pointed at this double, since a plain Controller does
# not advertise STARTTLS and a client that tries it would hang.
import socket
from email import message_from_bytes, policy
from email.message import EmailMessage

from aiosmtpd.controller import Controller
from aiosmtpd.smtp import Envelope, Session


def _free_port() -> int:
    """Picks a concrete free port ourselves (bind/read/close) instead of
    relying on Controller's port=0, whose startup check connects before
    the OS has assigned an ephemeral port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _CapturingHandler:
    """aiosmtpd message handler that appends every received message to a list."""

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    async def handle_DATA(self, server, session: Session, envelope: Envelope) -> str:
        """Captures the raw DATA bytes as a real EmailMessage (policy.default
        so .get_body()/.iter_attachments() work like mailer.py's output)."""
        content = envelope.content
        assert isinstance(content, bytes)
        self.messages.append(message_from_bytes(content, policy=policy.default))
        return "250 Message accepted for delivery"


class FakeSmtpServer:
    """Started/stopped per-test -- Controller runs the SMTP server on a
    real background thread bound to a concrete port."""

    def __init__(self, host: str = "127.0.0.1", port: int | None = None) -> None:
        self.handler = _CapturingHandler()
        self._port = port if port is not None else _free_port()
        self._controller = Controller(self.handler, hostname=host, port=self._port)

    def start(self) -> None:
        """Starts the SMTP controller on its background thread."""
        self._controller.start()

    def stop(self) -> None:
        """Stops the controller."""
        self._controller.stop()

    @property
    def port(self) -> int:
        """The concrete bound port callers point AppConfig.smtp_port at."""
        return self._port

    @property
    def messages(self) -> list[EmailMessage]:
        """Every message received so far, as parsed EmailMessage objects."""
        return self.handler.messages


# Module-level singleton backing the start/stop function API the scaffold
# stubs declared -- a test that only needs a bare (host, port) uses these;
# a test that needs to assert on captured messages uses FakeSmtpServer
# directly.
_server: FakeSmtpServer | None = None


def start_fake_smtp_server(host: str = "127.0.0.1", port: int = 0) -> tuple[str, int]:
    """Starts a local aiosmtpd controller; returns (host, bound_port)."""
    global _server
    _server = FakeSmtpServer(host=host, port=port or None)
    _server.start()
    return host, _server.port


def stop_fake_smtp_server() -> None:
    """Stops the controller started by start_fake_smtp_server."""
    global _server
    if _server is not None:
        _server.stop()
        _server = None
