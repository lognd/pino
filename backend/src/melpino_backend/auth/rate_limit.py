from __future__ import annotations

# Redis token-bucket rate limiting with an in-process fallback -- see
# docs/design/02-auth-and-security.md's threshold table. CRIB: logand.app
# backend/src/logand_backend/auth/rate_limit.py.
from fastapi import Request

# Thresholds per docs/design/02-auth-and-security.md.
LOGIN = (5, 15 * 60)
BOOKING_CREATE = (5, 60 * 60)
BOOKING_MANAGE_LOOKUP = (30, 60 * 60)
PAYMENT = (20, 60)
PUBLIC_READ = (120, 60)
ADMIN = (300, 60)


class RateLimiter:
    """Token-bucket limiter keyed by (bucket_name, client_key); Redis-backed
    when configured, degrading to an in-process fallback on any Redis error."""

    def __init__(
        self, limit: int, window_seconds: int, redis_url: str | None = None
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._redis_url = redis_url

    async def check(self, bucket: str, client_key: str) -> None:
        """Raises HTTPException(429, Retry-After=...) once the bucket is exhausted."""
        raise NotImplementedError(
            "see docs/design/02-auth-and-security.md"
        )  # TODO(impl)


def rate_limit(
    bucket: str, limit: int, window_seconds: int, redis_url: str | None = None
):
    """FastAPI dependency factory: `Depends(rate_limit("login", *LOGIN))`."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


def client_key(request: Request) -> str:
    """Resolves the rate-limit key -- the real peer IP, trusting the
    rightmost X-Forwarded-For hop only (Caddy is the sole trusted proxy)."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)
