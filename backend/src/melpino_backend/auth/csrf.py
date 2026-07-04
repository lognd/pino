from __future__ import annotations

# Double-submit CSRF check, bound to the session's own csrf_secret --
# see docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/auth/csrf.py.
from fastapi import Request

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def generate_csrf_secret() -> str:
    """Mints a fresh random CSRF secret for a new session."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


def verify_csrf(request: Request, expected_secret: str | None = None) -> None:
    """Raises HTTPException(403) unless cookie==header (and, when
    expected_secret is given, both equal the session's own secret)."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)
