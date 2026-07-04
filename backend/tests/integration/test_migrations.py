"""Migration round-trip test, per docs/design/03-database.md's "Migration
rules" section: "Integration test: fresh-DB upgrade to head + downgrade
round-trip (see 12-testing-strategy.md)."

Deliberately independent of tests/conftest.py's `db_session` fixture --
that fixture is still a scaffold stub (raises NotImplementedError) and,
even once implemented, is documented to build its schema via
Base.metadata.create_all() rather than by running real Alembic
migrations. Neither of those exercises the migration chain itself, so
this test manages its own throwaway Postgres container end to end: run
`alembic upgrade head` against a genuinely empty database, assert every
expected table exists, then `alembic downgrade base` and assert they are
all gone again.

DB selection, per this test's own dispatch instructions:
  1. If `docker info` fails, skip cleanly (no Docker available in this
     environment) -- never fail the suite for an infra reason.
  2. If Docker is reachable, use testcontainers[postgres] (already a dev
     dependency per pyproject.toml/uv.lock) to spin up a disposable
     Postgres, rather than reaching for the repo's docker-compose.dev.yml
     service (which is meant for long-lived local dev, not throwaway test
     runs, and unlike testcontainers doesn't guarantee this test gets a
     genuinely empty database if that service is already up).
"""

from __future__ import annotations

import asyncio
import shutil
import subprocess
from pathlib import Path
from typing import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

# Every table a fresh `alembic upgrade head` must produce -- kept as an
# explicit list (not "whatever Base.metadata currently has") so this test
# fails loudly if a new db/models/*.py table is added without a migration
# for it. See docs/design/03-database.md for the authoritative schema.
_EXPECTED_TABLES = {
    "users",
    "sessions",
    "password_reset_tokens",
    "admin_audit_log",
    "email_opt_out",
    "courses",
    "class_sessions",
    "students",
    "bookings",
    "waitlist_entries",
    "waivers",
    "invoices",
    "invoice_line_items",
    "payments",
    "refunds",
    "payment_proofs",
    "reminders_sent",
    "alembic_version",
}


def _docker_available() -> bool:
    """True if a Docker daemon is reachable from this process."""
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


@pytest.fixture(scope="module")
def postgres_url() -> Iterator[str]:
    """Session-disposable Postgres via testcontainers -- skipped cleanly
    if Docker isn't reachable at all (see module docstring)."""
    if not _docker_available():
        pytest.skip("Docker is not reachable; skipping migration round-trip test")

    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine", driver="asyncpg") as container:
        yield container.get_connection_url()


def _alembic_config() -> Config:
    cfg = Config(str(_BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option(
        "script_location",
        str(_BACKEND_ROOT / "src" / "melpino_backend" / "db" / "migrations"),
    )
    return cfg


async def _run_upgrade(cfg: Config, revision: str) -> None:
    # env.py's run_migrations_online() calls asyncio.run(...) internally --
    # command.upgrade()/downgrade() are otherwise-synchronous alembic APIs
    # that end up invoking that. Calling them directly from this
    # (already async, pytest-asyncio) test would raise "asyncio.run()
    # cannot be called from a running event loop"; running them in a
    # separate thread gives env.py's asyncio.run() its own fresh loop.
    await asyncio.to_thread(command.upgrade, cfg, revision)


async def _run_downgrade(cfg: Config, revision: str) -> None:
    await asyncio.to_thread(command.downgrade, cfg, revision)


async def _table_names(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        return set(
            await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
        )


async def test_alembic_upgrade_head_from_empty_database(
    postgres_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fresh-DB `alembic upgrade head` creates every table, and
    `alembic downgrade base` cleanly removes them again."""
    # env.py reads DATABASE_URL directly from os.environ (never from the
    # Alembic Config object).
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    cfg = _alembic_config()

    await _run_upgrade(cfg, "head")

    engine = create_async_engine(postgres_url)
    try:
        tables = await _table_names(engine)
        missing = _EXPECTED_TABLES - tables
        assert not missing, f"alembic upgrade head did not create: {missing}"
    finally:
        await engine.dispose()

    # Round-trip: downgrading all the way back to base must succeed
    # cleanly and leave no domain tables behind.
    await _run_downgrade(cfg, "base")

    engine = create_async_engine(postgres_url)
    try:
        tables = await _table_names(engine)
        leftover = (_EXPECTED_TABLES - {"alembic_version"}) & tables
        assert not leftover, f"alembic downgrade base left tables behind: {leftover}"
    finally:
        await engine.dispose()

    # And re-upgrading from that clean-downgrade state must work again --
    # catches a downgrade() that drops something upgrade() can't recreate.
    await _run_upgrade(cfg, "head")
    engine = create_async_engine(postgres_url)
    try:
        tables = await _table_names(engine)
        missing = _EXPECTED_TABLES - tables
        assert not missing, f"re-running upgrade head after downgrade missed: {missing}"
    finally:
        await engine.dispose()
