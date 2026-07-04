from __future__ import annotations

# Waiver upload/list -- see docs/design/06-waivers-and-legal.md and
# docs/design/13-storage-abstraction.md. Waiver scans are PII-dense:
# private storage keys only, streamed through authenticated admin routes,
# never a public URL.
from typing import TYPE_CHECKING
from uuid import UUID

from typani.result import Result

from melpino_backend.errors import WaiverError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.db.models.waivers import Waiver
    from melpino_backend.domain.storage.base import StorageBackend


async def upload_waiver(
    db: "AsyncSession",
    storage: "StorageBackend",
    *,
    student_id: UUID,
    content_type: str,
    data: bytes,
) -> Result["Waiver", WaiverError]:
    """Validates content_type against the allowlist, stores the file, and
    records a Waiver row."""
    raise NotImplementedError("see docs/design/06-waivers-and-legal.md")  # TODO(impl)


async def list_waivers_for_student(
    db: "AsyncSession", student_id: UUID
) -> list["Waiver"]:
    """Admin roster view: every waiver on file for a student."""
    raise NotImplementedError("see docs/design/06-waivers-and-legal.md")  # TODO(impl)


async def stream_waiver(
    db: "AsyncSession", storage: "StorageBackend", waiver_id: UUID
) -> Result[bytes, WaiverError]:
    """Streams a waiver's bytes through the backend's own authenticated
    route -- never a public URL."""
    raise NotImplementedError("see docs/design/06-waivers-and-legal.md")  # TODO(impl)
