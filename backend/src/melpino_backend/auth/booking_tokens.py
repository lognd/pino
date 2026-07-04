from __future__ import annotations

# Guest booking manage-token mint/hash/lookup -- melpino's one auth
# invention, no logand.app equivalent. See
# docs/design/02-auth-and-security.md's "Guest booking tokens" section:
# 256-bit random token, sha256-hashed at rest, grants access to exactly
# one booking, expires 30 days after the session's end, and every lookup
# failure is BookingError.TokenInvalid regardless of cause (never confirm
# a booking exists to someone guessing).
from typing import TYPE_CHECKING

from typani.result import Result

from melpino_backend.errors import BookingError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.db.models.bookings import Booking


def mint_manage_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash) -- the raw value is only ever put
    in the confirmation email/page URL, never persisted."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


def hash_token(raw_token: str) -> str:
    """sha256 hex digest of a raw manage token."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def find_booking_by_token(
    db: AsyncSession, raw_token: str
) -> Result[Booking, BookingError]:
    """Looks up a booking by its manage token; always Err(TokenInvalid)
    on any failure (wrong token, expired token, or booking not found) --
    never a distinct status per docs/design/02."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)
