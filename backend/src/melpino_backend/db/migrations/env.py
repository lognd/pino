from __future__ import annotations

# Alembic runtime environment -- resolves DATABASE_URL from the real
# process environment (never a parsed .env) and points autogenerate at
# Base.metadata. CRIB: logand.app backend/src/logand_backend/db/migrations/env.py
# (structure copied verbatim, module names renamed).
import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# NOTE: this import is required even though nothing below references the
# names directly -- it populates Base.metadata so autogenerate can see
# every table. Do not remove it as "unused".
import melpino_backend.db.models  # noqa: F401
from melpino_backend.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    """Reads DATABASE_URL directly from os.environ -- identical behavior
    whether the value came from a real .env (loaded by the caller) or
    from CI/CD secrets; this script never opens .env itself."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL must be set in the environment to run migrations"
        )
    return url


def run_migrations_offline() -> None:
    """Emits SQL to stdout without a live DB connection (`alembic upgrade --sql`)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Runs migrations against a real async engine, one connection per invocation."""
    connectable: AsyncEngine = create_async_engine(_database_url())
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
