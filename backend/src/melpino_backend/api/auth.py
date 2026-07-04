from __future__ import annotations

# Admin login/logout/me -- see docs/design/02-auth-and-security.md. CRIB:
# logand.app backend/src/logand_backend/api/auth.py (admin-only here;
# melpino has no customer/self-registration surface at all).
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from melpino_backend.auth.sessions import SessionInfo, _get_session_from_cookie

router = APIRouter(prefix="/api/auth", tags=["auth"])


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


@router.post("/login")
async def login(payload: LoginRequest, response: Response) -> MeResponse:
    """Validates credentials, mints a session, sets the __Host-session cookie."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


@router.post("/logout")
async def logout(session: SessionInfo = Depends(_get_session_from_cookie)) -> None:
    """Revokes the current session and clears the cookie."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


@router.get("/me")
async def me(session: SessionInfo = Depends(_get_session_from_cookie)) -> MeResponse:
    """Returns the current admin session's identity."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)
