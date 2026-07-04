from __future__ import annotations

# Guest booking manage-token mint/hash/lookup -- melpino's one auth
# invention, no logand.app equivalent. See
# docs/design/02-auth-and-security.md's "Guest booking tokens" section:
# 256-bit random token, sha256-hashed at rest, grants access to exactly
# one booking, expires 30 days after the session's end, and every lookup
# failure is BookingError.TokenInvalid regardless of cause (never confirm
# a booking exists to someone guessing).
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select
from typani.result import Err, Ok, Result

from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.errors import BookingError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Per docs/design/02: a manage token stays valid until 30 days after the
# session's end.
_TOKEN_VALIDITY_AFTER_SESSION_END = timedelta(days=30)


def mint_manage_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash) -- the raw value is only ever put
    in the confirmation email/page URL, never persisted."""
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_token(raw_token)


def hash_token(raw_token: str) -> str:
    """sha256 hex digest of a raw, cryptographically random token -- the
    only form of a bearer token this codebase ever persists. The raw value
    only ever exists in the email/URL and in-memory during the request
    that issues or consumes it, so a DB leak alone can never be replayed
    as a live token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def find_booking_by_token(
    db: AsyncSession, raw_token: str
) -> Result[Booking, BookingError]:
    """Looks up a booking by its manage token; always Err(TokenInvalid)
    on any failure (wrong token, expired token, or booking not found) --
    never a distinct status per docs/design/02.

    Never logs the raw token -- only booking ids, per doc 02's "tokens
    must never be logged" rule.
    """
    token_hash = hash_token(raw_token)

    result = await db.execute(
        select(Booking, ClassSession.ends_at)
        .join(ClassSession, ClassSession.id == Booking.session_id)
        .where(Booking.manage_token_hash == token_hash)
    )
    row = result.first()
    if row is None:
        logger.info("booking token lookup failed: no matching hash")
        return Err(BookingError.TokenInvalid)

    booking, session_ends_at = row
    expires_at = session_ends_at + _TOKEN_VALIDITY_AFTER_SESSION_END
    now = datetime.now(timezone.utc)
    if now >= expires_at:
        logger.info(
            "booking token lookup failed: expired booking_id=%s", booking.id
        )
        return Err(BookingError.TokenInvalid)

    logger.info("booking token lookup succeeded booking_id=%s", booking.id)
    return Ok(booking)
