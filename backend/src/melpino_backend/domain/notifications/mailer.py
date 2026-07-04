from __future__ import annotations

# SMTP / Gmail OAuth2 mail transport -- see
# docs/design/04-booking-and-scheduling.md ("copy logand.app's
# notifications stack"). CRIB: logand.app
# backend/src/logand_backend/domain/notifications/mailer.py -- Google
# retired password/app-password SMTP auth for Workspace accounts (March
# 2025); a Workspace mailbox must use the Gmail REST API's service-account
# JWT Bearer flow instead, mutually exclusive with plain SMTP_* in
# practice.
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from email.message import EmailMessage

    from melpino_backend.app.config import AppConfig


@dataclass(frozen=True)
class EmailAttachment:
    """A real MIME attachment -- filename, bytes, and split maintype/subtype."""

    filename: str
    content: bytes
    maintype: str
    subtype: str


def is_configured(cfg: "AppConfig") -> bool:
    """True once plain SMTP or Gmail OAuth2 is configured."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def sign_unsubscribe_token(user_id: UUID, cfg: "AppConfig") -> str:
    """HMAC-signed, day-granularity, expiring unsubscribe token."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def verify_unsubscribe_token(token: str, cfg: "AppConfig") -> UUID | None:
    """None for any malformed, tampered, or expired token."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


def build_message(
    cfg: "AppConfig",
    *,
    to_email: str,
    to_user_id: UUID,
    subject: str,
    content_html: str,
    content_text: str,
    attachments: tuple[EmailAttachment, ...] = (),
) -> "EmailMessage":
    """Builds a real multipart/alternative MIME message with CAN-SPAM
    footer + RFC 8058 one-click unsubscribe headers."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


async def send_email(
    cfg: "AppConfig",
    *,
    to_email: str,
    to_user_id: UUID,
    subject: str,
    content_html: str,
    content_text: str,
    attachments: tuple[EmailAttachment, ...] = (),
) -> None:
    """Sends via Gmail OAuth2 (if configured) else plain SMTP. Caller must
    check is_configured(cfg) first."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
