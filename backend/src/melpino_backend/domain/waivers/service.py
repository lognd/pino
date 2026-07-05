from __future__ import annotations

# Waiver upload/list -- see docs/design/06-waivers-and-legal.md and
# docs/design/13-storage-abstraction.md. Waiver scans are PII-dense:
# private storage keys only, streamed through authenticated admin routes,
# never a public URL.
import hashlib
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import select
from typani.result import Err, Ok, Result

from melpino_backend.db.models.students import Student
from melpino_backend.db.models.waivers import Waiver
from melpino_backend.errors import WaiverError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.domain.storage.base import StorageBackend

# Doc 03/db model CHECK constraint -- the allowlisted content types a
# waiver scan may be uploaded as. The one place this list is spelled out
# in Python (the model's CHECK is the DB-side mirror of the same rule).
_ALLOWED_CONTENT_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
}

# Bumped whenever the waiver's legal text changes -- see doc 06. Recorded
# on every uploaded waiver row so an old scan's template_version can be
# distinguished from the current one during an audit.
CURRENT_TEMPLATE_VERSION = "v1"


def _sniffed_content_type(data: bytes) -> str | None:
    """Identifies one of the allowlisted content types from leading magic
    bytes, or None if the actual bytes don't match any of them.

    FINDINGS.md L2: the browser-supplied Content-Type header is not
    evidence of what the bytes actually are -- upload_waiver below must
    check this against the client-declared value, not just against the
    allowlist's keys, or the "allowlisted content types only" guard
    validates a string an uploader fully controls while doing nothing to
    the bytes themselves."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


async def upload_waiver(
    db: "AsyncSession",
    storage: "StorageBackend",
    *,
    student_id: UUID,
    content_type: str,
    data: bytes,
    session_id: UUID | None = None,
    uploaded_by: UUID | None = None,
) -> Result["Waiver", WaiverError]:
    """Validates content_type against the allowlist, stores the file, and
    records a Waiver row."""
    student = await db.get(Student, student_id)
    if student is None:
        return Err(WaiverError.StudentNotFound)

    ext = _ALLOWED_CONTENT_TYPES.get(content_type)
    if ext is None:
        return Err(WaiverError.UnsupportedContentType)
    # FINDINGS.md L2: the declared content_type must also match what the
    # bytes actually are -- otherwise the allowlist only constrains a
    # client-controlled label, not the uploaded content.
    if _sniffed_content_type(data) != content_type:
        return Err(WaiverError.UnsupportedContentType)

    waiver_id = uuid4()
    file_hash = hashlib.sha256(data).hexdigest()
    key = f"waivers/{student_id}/{waiver_id}.{ext}"

    await storage.put(key, data, content_type)

    waiver = Waiver(
        id=waiver_id,
        student_id=student_id,
        session_id=session_id,
        template_version=CURRENT_TEMPLATE_VERSION,
        file_key=key,
        content_type=content_type,
        file_hash=file_hash,
        uploaded_by=uploaded_by,
    )
    db.add(waiver)
    await db.flush()
    return Ok(waiver)


async def list_waivers_for_student(
    db: "AsyncSession", student_id: UUID
) -> list["Waiver"]:
    """Admin roster view: every waiver on file for a student."""
    query = (
        select(Waiver)
        .where(Waiver.student_id == student_id)
        .order_by(Waiver.created_at.desc())
    )
    rows = (await db.execute(query)).scalars().all()
    return list(rows)


async def stream_waiver(
    db: "AsyncSession", storage: "StorageBackend", waiver_id: UUID
) -> Result[bytes, WaiverError]:
    """Streams a waiver's bytes through the backend's own authenticated
    route -- never a public URL."""
    waiver = await db.get(Waiver, waiver_id)
    if waiver is None:
        return Err(WaiverError.NotFound)
    data = await storage.get(waiver.file_key)
    return Ok(data)
