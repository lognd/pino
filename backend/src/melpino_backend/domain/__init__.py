from __future__ import annotations

# Framework-agnostic business logic -- never imports FastAPI. See
# docs/design/01-backend-architecture.md's layering rule: api/ calls
# domain/, domain/ calls db/, domain/ never imports FastAPI.
