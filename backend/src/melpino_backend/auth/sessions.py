from __future__ import annotations

# Admin server-side session create/validate/revoke -- see
# docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/auth/sessions.py (sliding idle timeout,
# absolute lifetime cap, require_admin/require_staff dependency guards).
#
# NOTE: melpino has no customer accounts/sessions at all (see doc 02's
# threat model) -- unlike logand.app there is a single idle timeout, not
# a per-role table.
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, cast
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select
from typani.result import Err, Ok, Result

from melpino_backend.auth.booking_tokens import hash_token
from melpino_backend.db.base import get_db
from melpino_backend.db.models.sessions import Session
from melpino_backend.db.models.users import User
from melpino_backend.errors import AuthError

if TYPE_CHECKING:
    from sqlalchemy import CursorResult
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Per docs/design/02: sliding idle timeout 12h, absolute lifetime 7 days
# (admin-only system; no customer sessions exist here at all).
_IDLE_TIMEOUT = timedelta(hours=12)
_ABSOLUTE_MAX_LIFETIME = timedelta(days=7)
SESSION_COOKIE_NAME = "__Host-session"


class SessionInfo(BaseModel):
    """A validated admin session's identity and expiry, resolved from a
    session cookie."""

    model_config = {}

    id: UUID
    user_id: UUID
    role: str
    csrf_secret: str
    expires_at: datetime


async def create_session(
    db: AsyncSession, user_id: UUID, role: str
) -> Result[tuple[str, SessionInfo], AuthError]:
    """Mints a new session; returns (raw_token, SessionInfo) -- only the
    token's sha256 hash is ever persisted."""
    raw_token = secrets.token_urlsafe(32)
    csrf_secret = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + _IDLE_TIMEOUT

    row = Session(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        csrf_secret=csrf_secret,
        expires_at=expires_at,
    )
    db.add(row)
    await db.flush()

    logger.info("session created for user_id=%s role=%s", user_id, role)
    info = SessionInfo(
        id=row.id,
        user_id=row.user_id,
        role=role,
        csrf_secret=row.csrf_secret,
        expires_at=row.expires_at,
    )
    return Ok((raw_token, info))


async def validate_session(
    db: AsyncSession, raw_token: str
) -> Result[SessionInfo, AuthError]:
    """Resolves a raw session token, sliding the idle timeout forward."""
    token_hash = hash_token(raw_token)

    result = await db.execute(
        select(Session, User.role, User.disabled_at)
        .join(User, User.id == Session.user_id)
        .where(Session.token_hash == token_hash)
    )
    row = result.first()
    if row is None:
        logger.info("session validation failed: token not found")
        return Err(AuthError.SessionNotFound)

    session_row, role, disabled_at = row
    now = datetime.now(timezone.utc)
    if session_row.expires_at <= now:
        logger.info("session validation failed: expired session_id=%s", session_row.id)
        return Err(AuthError.SessionExpired)
    # Defense in depth: a disabled account's session surviving here (a bug
    # elsewhere, a direct DB edit, a future code path) must still be
    # rejected, not silently honored just because the row hasn't expired.
    if disabled_at is not None:
        logger.warning(
            "session validation rejected: user disabled user_id=%s",
            session_row.user_id,
        )
        return Err(AuthError.SessionNotFound)

    # Slide the idle-timeout window forward, still capped by the absolute
    # max lifetime measured from created_at (per docs/design/02).
    created_at = session_row.created_at
    absolute_cap = created_at + _ABSOLUTE_MAX_LIFETIME
    session_row.expires_at = min(now + _IDLE_TIMEOUT, absolute_cap)
    await db.flush()

    return Ok(
        SessionInfo(
            id=session_row.id,
            user_id=session_row.user_id,
            role=role,
            csrf_secret=session_row.csrf_secret,
            expires_at=session_row.expires_at,
        )
    )


async def revoke_session(db: AsyncSession, session_id: UUID) -> Result[None, AuthError]:
    """Deletes a single session row."""
    delete_stmt = delete(Session).where(Session.id == session_id)
    result = cast("CursorResult", await db.execute(delete_stmt))
    if result.rowcount == 0:
        logger.info("revoke_session: no row for session_id=%s", session_id)
        return Err(AuthError.SessionNotFound)
    logger.info("session revoked session_id=%s", session_id)
    return Ok(None)


async def revoke_all_sessions_for_user(
    db: AsyncSession, user_id: UUID
) -> Result[None, AuthError]:
    """Deletes every session for one user."""
    await db.execute(delete(Session).where(Session.user_id == user_id))
    logger.info("all sessions revoked for user_id=%s", user_id)
    return Ok(None)


async def revoke_all_sessions_globally(db: AsyncSession) -> Result[None, AuthError]:
    """The admin 'kill all sessions' nuclear option."""
    await db.execute(delete(Session))
    logger.warning("all sessions revoked globally")
    return Ok(None)


async def _get_session_from_cookie(
    request: Request,
    db: AsyncSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> SessionInfo:
    """FastAPI dependency resolving the current admin session from its cookie."""
    cached = getattr(request.state, "session_info", None)
    if cached is not None:
        return cached
    if session_token is None:
        raise HTTPException(status_code=401, detail=AuthError.SessionNotFound.value)
    result = await validate_session(db, session_token)
    if result.is_err:
        raise HTTPException(status_code=401, detail=result.danger_err.value)
    return result.danger_ok


async def require_admin(
    session: SessionInfo = Depends(_get_session_from_cookie),
) -> SessionInfo:
    """FastAPI dependency: 401s unless the resolved session has role='admin'."""
    if session.role != "admin":
        raise HTTPException(status_code=401, detail=AuthError.SessionNotFound.value)
    return session


async def require_staff(
    session: SessionInfo = Depends(_get_session_from_cookie),
) -> SessionInfo:
    """FastAPI dependency: 401s unless role is 'admin' or 'staff' -- see
    docs/design/02's authorization model (staff = admin permissions minus
    user management and refunds, enforced per-route, not here)."""
    if session.role not in ("admin", "staff"):
        raise HTTPException(status_code=401, detail=AuthError.SessionNotFound.value)
    return session
