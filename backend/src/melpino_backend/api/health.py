from __future__ import annotations

# GET /api/health -- see docs/design/01-backend-architecture.md. CRIB:
# logand.app backend/src/logand_backend/api/health.py.
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Liveness probe payload."""

    model_config = {}

    status: str = "ok"


@router.get("/api/health")
async def health() -> HealthResponse:
    """Always returns status=ok if the process can serve HTTP at all."""
    return HealthResponse()
