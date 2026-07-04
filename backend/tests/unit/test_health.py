from __future__ import annotations

# Unit coverage for GET /api/health -- see docs/design/01-backend-architecture.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/01-backend-architecture.md")
def test_health_returns_ok() -> None:
    """GET /api/health returns {"status": "ok"} with a 200."""
