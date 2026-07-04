from __future__ import annotations

# Unit coverage for admin sessions/CSRF/Argon2id -- see
# docs/design/02-auth-and-security.md.
#
# Session expiry/revocation tests need a real Postgres-backed
# db/models.Session -- those live in
# tests/integration/test_auth_integration.py instead (db/models are being
# implemented concurrently by another agent and are not importable as
# real tables yet).
import time

import pytest
from fastapi import HTTPException, Request

from melpino_backend.auth import csrf, passwords, rate_limit


def _make_request(
    method: str = "POST",
    cookies: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> Request:
    raw_headers = [
        (k.lower().encode(), v.encode()) for k, v in (headers or {}).items()
    ]
    if cookies:
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
        raw_headers.append((b"cookie", cookie_header.encode()))
    scope = {
        "type": "http",
        "method": method,
        "headers": raw_headers,
        "path": "/",
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def test_argon2id_hash_round_trip() -> None:
    """hash_password/verify_password round-trip correctly and reject wrong passwords."""
    hashed = passwords.hash_password("correct horse battery staple")
    assert passwords.verify_password("correct horse battery staple", hashed)
    assert not passwords.verify_password("wrong password", hashed)


def test_argon2id_dummy_hash_verifies_false() -> None:
    """DUMMY_HASH exists and never verifies true for an arbitrary password,
    supporting the timing-parity login branch."""
    assert not passwords.verify_password("anything", passwords.DUMMY_HASH)


def test_csrf_rejects_mismatched_double_submit() -> None:
    """verify_csrf 403s when cookie != header or neither matches the session secret."""
    # cookie/header both missing
    request = _make_request()
    with pytest.raises(HTTPException) as exc_info:
        csrf.verify_csrf(request)
    assert exc_info.value.status_code == 403

    # cookie != header
    request = _make_request(
        cookies={csrf.CSRF_COOKIE_NAME: "aaa"},
        headers={csrf.CSRF_HEADER_NAME: "bbb"},
    )
    with pytest.raises(HTTPException) as exc_info:
        csrf.verify_csrf(request)
    assert exc_info.value.status_code == 403

    # cookie == header but doesn't match the session's own secret
    request = _make_request(
        cookies={csrf.CSRF_COOKIE_NAME: "aaa"},
        headers={csrf.CSRF_HEADER_NAME: "aaa"},
    )
    with pytest.raises(HTTPException) as exc_info:
        csrf.verify_csrf(request, expected_secret="the-real-secret")
    assert exc_info.value.status_code == 403


def test_csrf_accepts_matching_double_submit() -> None:
    """verify_csrf passes silently when cookie==header==session secret."""
    request = _make_request(
        cookies={csrf.CSRF_COOKIE_NAME: "shared-secret"},
        headers={csrf.CSRF_HEADER_NAME: "shared-secret"},
    )
    csrf.verify_csrf(request, expected_secret="shared-secret")


def test_csrf_safe_methods_skip_check() -> None:
    """GET/HEAD/OPTIONS never raise, even with no cookie/header at all."""
    request = _make_request(method="GET")
    csrf.verify_csrf(request)


@pytest.mark.asyncio
async def test_login_rate_limit_returns_429_with_retry_after() -> None:
    """The 6th admin login attempt in 15 minutes 429s with a Retry-After
    header, via the in-process fallback bucket (no redis_url configured)."""
    limiter = rate_limit.RateLimiter(*rate_limit.LOGIN)
    for _ in range(5):
        await limiter.check("login", "1.2.3.4")

    with pytest.raises(HTTPException) as exc_info:
        await limiter.check("login", "1.2.3.4")
    assert exc_info.value.status_code == 429
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.asyncio
async def test_rate_limit_buckets_are_isolated_per_key() -> None:
    """A different client_key gets its own bucket, unaffected by another
    key's exhausted count."""
    limiter = rate_limit.RateLimiter(1, 60)
    await limiter.check("login", "1.1.1.1")
    # a different key is not rate limited
    await limiter.check("login", "2.2.2.2")
    with pytest.raises(HTTPException):
        await limiter.check("login", "1.1.1.1")


def test_client_key_uses_rightmost_x_forwarded_for_hop() -> None:
    """client_key trusts only the rightmost X-Forwarded-For hop (Caddy's own
    append), never attacker-controlled entries to its left."""
    request = _make_request(
        method="GET", headers={"X-Forwarded-For": "9.9.9.9, 10.0.0.1"}
    )
    assert rate_limit.client_key(request) == "10.0.0.1"


def test_client_key_falls_back_to_peer_ip() -> None:
    """With no X-Forwarded-For header, client_key uses the direct peer IP."""
    request = _make_request(method="GET")
    assert rate_limit.client_key(request) == "127.0.0.1"


@pytest.mark.asyncio
async def test_rate_limit_window_expires_old_hits() -> None:
    """Hits outside the window no longer count against the limit."""
    limiter = rate_limit.RateLimiter(1, 1)  # 1 request / 1 second window
    await limiter.check("bucket", "1.2.3.4")
    time.sleep(1.05)
    # should not raise -- the earlier hit fell out of the window
    await limiter.check("bucket", "1.2.3.4")
