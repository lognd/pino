from __future__ import annotations

# Admin server-side session create/validate/revoke -- see
# docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/auth/sessions.py (sliding idle timeout,
# absolute lifetime cap, require_admin/require_staff dependency guards).
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import Cookie, Depends, Request
from pydantic import BaseModel
from typani.result import Result

from melpino_backend.db.base import get_db
from melpino_backend.errors import AuthError

if TYPE_CHECKING:
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession

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
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def validate_session(
    db: AsyncSession, raw_token: str
) -> Result[SessionInfo, AuthError]:
    """Resolves a raw session token, sliding the idle timeout forward."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def revoke_session(db: AsyncSession, session_id: UUID) -> Result[None, AuthError]:
    """Deletes a single session row."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def revoke_all_sessions_for_user(
    db: AsyncSession, user_id: UUID
) -> Result[None, AuthError]:
    """Deletes every session for one user."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def revoke_all_sessions_globally(db: AsyncSession) -> Result[None, AuthError]:
    """The admin 'kill all sessions' nuclear option."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def _get_session_from_cookie(
    request: Request,
    db: AsyncSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> SessionInfo:
    """FastAPI dependency resolving the current admin session from its cookie."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def require_admin(
    session: SessionInfo = Depends(_get_session_from_cookie),
) -> SessionInfo:
    """FastAPI dependency: 401s unless the resolved session has role='admin'."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


async def require_staff(
    session: SessionInfo = Depends(_get_session_from_cookie),
) -> SessionInfo:
    """FastAPI dependency: 401s unless role is 'admin' or 'staff' -- see
    docs/design/02's authorization model (staff = admin permissions minus
    user management and refunds, enforced per-route, not here)."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)
