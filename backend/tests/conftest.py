from __future__ import annotations

# Shared pytest fixtures -- db engine/session, AppConfig, FastAPI test
# client. Stubbed until db/base.py and app/app.py are implemented. See
# docs/design/12-testing-strategy.md.
from collections.abc import AsyncGenerator

import pytest


@pytest.fixture
async def db_session() -> AsyncGenerator[None]:
    """Will yield a real AsyncSession against a testcontainers-managed
    Postgres, schema created via Base.metadata.create_all()."""
    raise NotImplementedError("see docs/design/12-testing-strategy.md")  # TODO(impl)
    yield  # pragma: no cover -- unreachable until implemented


@pytest.fixture
def app_config() -> None:
    """Will return an AppConfig with test-safe defaults (fake_stripe/
    fake_paypal/fake_smtp api bases)."""
    raise NotImplementedError("see docs/design/12-testing-strategy.md")  # TODO(impl)
