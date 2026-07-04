from __future__ import annotations

# System test: login with a seeded admin -> session cookie set -> GET
# /api/auth/me succeeds -> logout -> me now fails. See
# docs/design/02-auth-and-security.md.
#
# NOTE (as of this writing): this test drives the full App() (not a
# router mounted in isolation) because the login/logout/me contract is
# inherently cross-cutting -- it needs the real CSRF middleware, the real
# session cookie set by api/auth.py, and the real domain/auth/service.py
# login/logout functions. That means it transitively depends on
# auth/sessions.py, auth/csrf.py, auth/rate_limit.py, and
# db/models/users.py, all of which are owned by concurrent agents and
# were still raising NotImplementedError / __abstract__ (no real columns)
# at the time this file was written. In particular, api/auth.py calls
# `rate_limit("login", *LOGIN, redis_url=...)` at IMPORT time (it backs a
# Depends(...) default), so merely importing melpino_backend.api.auth --
# and therefore building App() at all, since App._mount_routers mounts
# every router together -- currently raises NotImplementedError before
# any test body even runs. See this mission's final report for the
# retry/skip outcome.
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer

import melpino_backend.db.models  # noqa: F401 -- populates Base.metadata
from melpino_backend.app.app import App
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.passwords import hash_password
from melpino_backend.db.base import Base, dispose_engine, init_engine
from melpino_backend.db.models.users import User


@pytest.fixture(scope="module")
def _postgres_container():
    """One ephemeral Postgres container shared by every test in this
    module -- db/models/sessions.py and db/models/users.py both use
    sqlalchemy.dialects.postgresql.UUID columns, which sqlite cannot
    represent, so a real Postgres (not sqlite) is required here even
    though the DB itself is throwaway per test run."""
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture
async def seeded_admin_client(_postgres_container: PostgresContainer):
    """Builds a real App() against the ephemeral testcontainers Postgres
    (schema created via Base.metadata.create_all()), seeds one admin user
    directly, and yields an httpx AsyncClient talking to it over
    ASGITransport (no real network, and never the developer's own
    Postgres -- see docs/design/12-testing-strategy.md)."""
    sync_url = _postgres_container.get_connection_url()
    async_url = sync_url.replace("postgresql+psycopg2", "postgresql+asyncpg")
    cfg = AppConfig.model_validate({"database_url": async_url})
    init_engine(cfg.database_url)
    from melpino_backend.db import base as db_base

    assert db_base._engine is not None
    async with db_base._engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    assert db_base._sessionmaker is not None
    async with db_base._sessionmaker() as session:
        session.add(
            User(
                id=uuid4(),
                email="admin@example.com",
                password_hash=hash_password("correct horse battery staple"),
                role="admin",
            )
        )
        await session.commit()

    app = App(cfg)()
    # get_db is already wired to the real init_engine() sessionmaker above
    # via db.base's module-level state -- no override needed here.
    # https:// (not http://) base_url -- the session/CSRF cookies are set
    # with Secure=True (required for __Host- prefixed cookies), and
    # httpx's cookie jar only re-attaches a Secure cookie on a subsequent
    # request whose scheme is also https.
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        yield client

    # Drop everything so the next test in this module (same container,
    # fresh engine) starts from a clean schema rather than accumulating
    # rows/tables across tests.
    async with db_base._engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await dispose_engine()


async def test_login_me_logout_flow(seeded_admin_client: AsyncClient) -> None:
    """Full admin auth lifecycle: login sets cookies, me succeeds while
    logged in, logout revokes the session, me fails afterward."""
    client = seeded_admin_client

    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "correct horse battery staple"},
    )
    assert login_resp.status_code == 200
    assert "__Host-session" in client.cookies
    assert "csrf_token" in client.cookies

    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 200
    body = me_resp.json()
    assert body["role"] == "admin"

    logout_resp = await client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": client.cookies["csrf_token"]},
    )
    assert logout_resp.status_code == 200

    me_after_logout = await client.get("/api/auth/me")
    assert me_after_logout.status_code == 401


async def test_login_wrong_password_rejected(seeded_admin_client: AsyncClient) -> None:
    """Wrong password -> 401, no session cookie set."""
    client = seeded_admin_client

    resp = await client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "wrong password"},
    )
    assert resp.status_code == 401
    assert "__Host-session" not in client.cookies
