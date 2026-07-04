from __future__ import annotations

# Admin login/logout/me -- see docs/design/02-auth-and-security.md. CRIB:
# logand.app backend/src/logand_backend/api/auth.py (admin-only here;
# melpino has no customer/self-registration surface at all).
import argparse

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.csrf import CSRF_COOKIE_NAME
from melpino_backend.auth.rate_limit import LOGIN, rate_limit
from melpino_backend.auth.sessions import (
    SESSION_COOKIE_NAME,
    SessionInfo,
    _get_session_from_cookie,
)
from melpino_backend.db.base import get_db
from melpino_backend.domain.auth.service import login as login_domain
from melpino_backend.domain.auth.service import logout as logout_domain

router = APIRouter(prefix="/api/auth", tags=["auth"])

# NOTE: rate_limit()'s RateLimiter is constructed once here at import time
# (it backs a Depends(...) default, evaluated when this module loads, not
# per-request), so redis_url has to come from config here too -- see
# logand.app's identical NOTE in its own api/auth.py for the full
# reasoning (shared-across-workers rate limiting requires this, a
# per-request AppConfig() call would not).
_cfg = AppConfig.from_external(argparse.Namespace())


class LoginRequest(BaseModel):
    """Admin login form fields."""

    model_config = {}

    email: str
    password: str


class MeResponse(BaseModel):
    """The current admin session's identity."""

    model_config = {}

    user_id: str
    role: str


def _set_session_cookies(response: Response, raw_token: str, csrf_secret: str) -> None:
    """Sets the session + CSRF cookies per docs/design/02's attributes."""
    response.set_cookie(
        SESSION_COOKIE_NAME,
        raw_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_secret,
        httponly=False,
        secure=True,
        samesite="strict",
        path="/",
    )


@router.post("/login")
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(rate_limit("login", *LOGIN, redis_url=_cfg.redis_url)),
) -> MeResponse:
    """Validates credentials, mints a session, sets the __Host-session cookie."""
    result = await login_domain(db, payload.email, payload.password)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    raw_token, session = result.danger_ok
    _set_session_cookies(response, raw_token, session.csrf_secret)
    return MeResponse(user_id=str(session.user_id), role=session.role)


@router.post("/logout")
async def logout(
    response: Response,
    session: SessionInfo = Depends(_get_session_from_cookie),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Revokes the current session and clears the cookie."""
    result = await logout_domain(db, session.id)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    # secure/samesite/httponly must match _set_session_cookies' attributes
    # -- __Host- prefixed cookies REQUIRE Secure on every Set-Cookie,
    # including the expiry one delete_cookie emits; without it browsers
    # ignore the deletion entirely and the stale cookie lingers.
    response.delete_cookie(
        SESSION_COOKIE_NAME, path="/", httponly=True, secure=True, samesite="strict"
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME, path="/", httponly=False, secure=True, samesite="strict"
    )
    return {"status": "ok"}


@router.get("/me")
async def me(session: SessionInfo = Depends(_get_session_from_cookie)) -> MeResponse:
    """Returns the current admin session's identity."""
    return MeResponse(user_id=str(session.user_id), role=session.role)
