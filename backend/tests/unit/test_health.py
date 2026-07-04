from __future__ import annotations

# Unit coverage for GET /api/health -- calls the endpoint function
# directly with a session double (no ASGI stack; the full-app path is
# covered by tests/system/test_health.py). See
# docs/design/01-backend-architecture.md.
from fastapi import Response

from melpino_backend.api.health import health


class _OkSession:
    """Session double whose execute() succeeds like a healthy DB."""

    async def execute(self, _stmt: object) -> None:
        return None


class _DownSession:
    """Session double whose execute() fails like an unreachable DB."""

    async def execute(self, _stmt: object) -> None:
        raise ConnectionError("db unreachable")


async def test_health_returns_ok() -> None:
    """GET /api/health returns status=ok/db=ok when the DB ping succeeds."""
    response = Response()
    body = await health(response, db=_OkSession())  # type: ignore[arg-type]
    assert body.status == "ok"
    assert body.db == "ok"
    assert response.status_code != 503


async def test_health_degrades_to_503_when_db_ping_fails() -> None:
    """GET /api/health reports status=degraded/db=error with HTTP 503 when
    the DB ping raises."""
    response = Response()
    body = await health(response, db=_DownSession())  # type: ignore[arg-type]
    assert body.status == "degraded"
    assert body.db == "error"
    assert response.status_code == 503
