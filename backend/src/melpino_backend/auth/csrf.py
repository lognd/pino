from __future__ import annotations

# Double-submit CSRF check, bound to the session's own csrf_secret --
# see docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/auth/csrf.py.
import hmac
import logging
import secrets

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def generate_csrf_secret() -> str:
    """Mints a fresh random CSRF secret for a new session."""
    return secrets.token_urlsafe(32)


def verify_csrf(request: Request, expected_secret: str | None = None) -> None:
    """Raises HTTPException(403) unless cookie==header (and, when
    expected_secret is given, both equal the session's own secret).

    Double-submit alone only proves "whoever sent this request could read
    this app's own cookies for this origin" -- when expected_secret (the
    real session's own csrf_secret, looked up server-side) is given, the
    cookie AND header must both match THAT value too, not just each
    other. expected_secret=None is the fallback for a request with no
    resolvable live session; pure double-submit is still enforced so this
    never becomes a no-op.
    """
    if request.method in _SAFE_METHODS:
        return
    cookie_value = request.cookies.get(CSRF_COOKIE_NAME)
    header_value = request.headers.get(CSRF_HEADER_NAME)
    if not cookie_value or not header_value:
        logger.warning("csrf check failed: missing cookie or header")
        raise HTTPException(status_code=403, detail="csrf token missing or mismatched")
    if not hmac.compare_digest(cookie_value, header_value):
        logger.warning("csrf check failed: cookie/header mismatch")
        raise HTTPException(status_code=403, detail="csrf token missing or mismatched")
    if expected_secret is not None and not hmac.compare_digest(
        cookie_value, expected_secret
    ):
        logger.warning("csrf check failed: does not match session secret")
        raise HTTPException(status_code=403, detail="csrf token missing or mismatched")
