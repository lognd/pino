from __future__ import annotations

# GET /api/health -- see docs/design/01-backend-architecture.md. CRIB:
# logand.app backend/src/logand_backend/api/health.py, extended to ping
# the DB (docs/design/01: "pings the DB (SELECT 1)") since melpino's
# health probe (scripts/health_check.py) needs to distinguish "process is
# up" from "process is up but can't reach Postgres."
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.db.base import get_db
from melpino_backend.logging import get_logger

_log = get_logger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Liveness + DB-reachability probe payload."""

    model_config = {}

    status: str
    db: str


@router.get("/api/health")
async def health(
    response: Response, db: AsyncSession = Depends(get_db)
) -> HealthResponse:
    """status=ok/db=ok if a SELECT 1 round-trips; status=degraded/db=error
    (HTTP 503) if the DB ping fails -- the process itself is still up and
    able to answer this request either way."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        _log.error("health check: db ping failed", exc_info=exc)
        response.status_code = 503
        return HealthResponse(status="degraded", db="error")
    return HealthResponse(status="ok", db="ok")
