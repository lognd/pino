from __future__ import annotations

# Redis token-bucket rate limiting with an in-process fallback -- see
# docs/design/02-auth-and-security.md's threshold table. CRIB: logand.app
# backend/src/logand_backend/auth/rate_limit.py.
import logging
import time
from typing import cast

import redis.asyncio as redis
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# Thresholds per docs/design/02-auth-and-security.md.
LOGIN = (5, 15 * 60)
BOOKING_CREATE = (5, 60 * 60)
BOOKING_MANAGE_LOOKUP = (30, 60 * 60)
PAYMENT = (20, 60)
PUBLIC_READ = (120, 60)
ADMIN = (300, 60)


class RateLimiter:
    """Token-bucket limiter keyed by (bucket_name, client_key); Redis-backed
    when configured, degrading to an in-process fallback on any Redis error.

    A rate limiter is defense in depth, not core functionality, so a Redis
    outage degrades to weaker (per-process) limiting rather than 500ing
    every login/booking/payment attempt. Once a Redis error is seen, this
    instance stops retrying it for its own lifetime rather than eating a
    fresh connection-timeout latency hit on every subsequent request during
    an outage.
    """

    def __init__(
        self, limit: int, window_seconds: int, redis_url: str | None = None
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._redis_url = redis_url
        self._redis: redis.Redis | None = None
        self._redis_unavailable = False
        self._local_buckets: dict[str, list[float]] = {}

    async def check(self, bucket: str, client_key: str) -> None:
        """Raises HTTPException(429, Retry-After=...) once the bucket is exhausted."""
        if self._redis_url is not None and not self._redis_unavailable:
            try:
                await self._check_redis(bucket, client_key)
                return
            except HTTPException:
                raise  # a real 429 from _check_redis, not a connection failure
            except redis.RedisError as exc:
                self._redis_unavailable = True
                logger.warning(
                    "rate limiter: Redis unavailable (%s), falling back to "
                    "in-process limiting for the rest of this process's life",
                    exc,
                )
        self._check_local(bucket, client_key)

    def _check_local(self, bucket: str, client_key: str) -> None:
        now = time.monotonic()
        key = f"{bucket}:{client_key}"
        hits = [t for t in self._local_buckets.get(key, []) if now - t < self._window]
        if len(hits) >= self._limit:
            retry_after = int(self._window - (now - hits[0]))
            logger.info("rate limit exceeded (in-process) for bucket=%s", bucket)
            raise HTTPException(
                status_code=429,
                detail="rate limit exceeded",
                headers={"Retry-After": str(max(retry_after, 1))},
            )
        hits.append(now)
        self._local_buckets[key] = hits

    async def _check_redis(self, bucket: str, client_key: str) -> None:
        # NOTE: only called from check() when self._redis_url is not None --
        # asserting here narrows the type for the from_url() call below.
        assert self._redis_url is not None
        if self._redis is None:
            self._redis = redis.from_url(self._redis_url)

        key = f"ratelimit:{bucket}:{client_key}"
        # NOTE: INCR + EXPIRE NX is a fixed-window counter, not a true sliding
        # token bucket -- it can allow up to 2x the limit at window boundaries.
        # Acceptable for this site's traffic per docs/design/02.
        count = cast(int, await self._redis.incr(key))  # ty: ignore[invalid-await]
        if count == 1:
            await self._redis.expire(key, self._window)
        if count > self._limit:
            ttl = await self._redis.ttl(key)
            logger.info("rate limit exceeded (redis) for bucket=%s", bucket)
            raise HTTPException(
                status_code=429,
                detail="rate limit exceeded",
                headers={"Retry-After": str(max(ttl, 1))},
            )


def rate_limit(
    bucket: str, limit: int, window_seconds: int, redis_url: str | None = None
):
    """FastAPI dependency factory: `Depends(rate_limit("login", *LOGIN))`."""
    limiter = RateLimiter(limit, window_seconds, redis_url)

    async def _dependency(request: Request) -> None:
        await limiter.check(bucket, client_key(request))

    return _dependency


def client_key(request: Request) -> str:
    """Resolves the rate-limit key -- the real peer IP, trusting the
    rightmost X-Forwarded-For hop only (Caddy is the sole trusted proxy).

    Caddy's default reverse_proxy behavior APPENDS the real peer IP to any
    client-supplied X-Forwarded-For rather than replacing it, so a request
    can arrive as "X-Forwarded-For: <attacker-chosen>, <real-ip>". The
    RIGHTMOST entry is the one Caddy itself appended (the only trustworthy
    part of the header); everything to its left is attacker-controlled and
    must never be used as the rate-limit key.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"
