from __future__ import annotations

# System test for GET /api/health -- see docs/design/01-backend-
# architecture.md and docs/design/12-testing-strategy.md. Mounts only
# health.router in a bare FastAPI() (rather than the full App()) and
# overrides the get_db dependency with an in-memory fake session, so this
# test never touches a real Postgres and never depends on the other
# in-progress auth/rate_limit submodules that App()._mount_routers would
# otherwise pull in via api/auth.py.
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from melpino_backend.api import health
from melpino_backend.db.base import get_db


class _FakeDBOk:
    """A DB session double whose SELECT 1 always succeeds."""

    async def execute(self, _stmt: object) -> None:
        return None


class _FakeDBDown:
    """A DB session double simulating an unreachable Postgres."""

    async def execute(self, _stmt: object) -> None:
        raise RuntimeError("simulated db outage")


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(health.router)
    return app


async def test_health_ok() -> None:
    """SELECT 1 round-trips -> 200 {"status": "ok", "db": "ok"}."""
    app = _build_app()

    async def _override():
        yield _FakeDBOk()

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": "ok"}


async def test_health_degraded_when_db_down() -> None:
    """DB ping fails -> 503 {"status": "degraded", "db": "error"}."""
    app = _build_app()

    async def _override():
        yield _FakeDBDown()

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")

    assert resp.status_code == 503
    assert resp.json() == {"status": "degraded", "db": "error"}
