from __future__ import annotations

# Unit coverage for admin sessions/CSRF/Argon2id -- see
# docs/design/02-auth-and-security.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_session_expires_after_idle_timeout() -> None:
    """A session's idle timeout slides forward on use and expires past it."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_session_revocation_invalidates_immediately() -> None:
    """revoke_session makes a subsequent validate_session return SessionNotFound."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_csrf_rejects_mismatched_double_submit() -> None:
    """verify_csrf 403s when cookie != header or neither matches the session secret."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_argon2id_hash_round_trip() -> None:
    """hash_password/verify_password round-trip correctly and reject wrong passwords."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/02-auth-and-security.md")
def test_login_rate_limit_returns_429_with_retry_after() -> None:
    """The 6th admin login attempt in 15 minutes 429s with a Retry-After header."""
