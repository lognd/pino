from __future__ import annotations

# Async engine/sessionmaker lifecycle + declarative Base. CRIB: logand.app
# backend/src/logand_backend/db/base.py -- pattern copied verbatim (lazy
# init_engine, never at import time; get_db as a FastAPI dependency
# generator; get_session for standalone scripts).
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base -- every model in db/models/ inherits this."""


# NOTE: engine/sessionmaker are created lazily via init_engine(), not at
# import time -- importing db.base must never require DATABASE_URL to
# already be set (tests construct their own engine against a test database).
_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def init_engine(database_url: str) -> AsyncEngine:
    """Creates the process-wide async engine + sessionmaker."""
    raise NotImplementedError("see docs/design/03-database.md")  # TODO(impl)


async def dispose_engine() -> None:
    """Disposes the process-wide engine; safe to call if never initialized."""
    raise NotImplementedError("see docs/design/03-database.md")  # TODO(impl)


async def get_db() -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency: yields one session per request, rolled back on error."""
    raise NotImplementedError("see docs/design/03-database.md")  # TODO(impl)
    yield  # pragma: no cover -- unreachable until implemented


def get_session() -> AsyncSession:
    """For standalone scripts (scripts/scheduler.py) needing a real
    session outside FastAPI's own request lifecycle."""
    raise NotImplementedError("see docs/design/03-database.md")  # TODO(impl)
