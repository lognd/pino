from __future__ import annotations

# Waiver upload/list (admin) -- see docs/design/06-waivers-and-legal.md.
import argparse
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.sessions import SessionInfo, require_staff
from melpino_backend.db.base import get_db
from melpino_backend.db.models.waivers import Waiver
from melpino_backend.domain.storage.factory import get_storage_backend
from melpino_backend.domain.waivers.service import (
    list_waivers_for_student,
    stream_waiver,
    upload_waiver,
)
from melpino_backend.errors import WaiverError

router = APIRouter(prefix="/api/admin/waivers", tags=["admin-waivers"])

# Module-level AppConfig singleton -- same pattern (and same flagged
# blocking-per-test-injection issue) as api/bookings.py/api/courses.py;
# not addressed by this pass (see TODO.md's open P4 item).
_cfg = AppConfig.from_external(argparse.Namespace())


def _to_response(waiver) -> dict:  # noqa: ANN001 -- Waiver ORM row
    """Admin-facing waiver metadata -- never includes the storage key or
    a URL (see docs/design/13-storage-abstraction.md)."""
    return {
        "id": str(waiver.id),
        "student_id": str(waiver.student_id),
        "session_id": str(waiver.session_id) if waiver.session_id else None,
        "template_version": waiver.template_version,
        "content_type": waiver.content_type,
        "file_hash": waiver.file_hash,
        "created_at": waiver.created_at.isoformat(),
    }


@router.post("/students/{student_id}")
async def upload_waiver_endpoint(
    student_id: UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> dict:
    """Admin uploads a waiver scan for a student -- allowlisted content types only."""
    storage = get_storage_backend(_cfg)
    data = await file.read()
    result = await upload_waiver(
        db,
        storage,
        student_id=student_id,
        content_type=file.content_type or "application/octet-stream",
        data=data,
        uploaded_by=session.user_id,
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    await db.commit()
    return _to_response(result.danger_ok)


@router.get("/students/{student_id}")
async def list_waivers(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> list[dict]:
    """Admin lists every waiver on file for a student."""
    waivers = await list_waivers_for_student(db, student_id)
    return [_to_response(w) for w in waivers]


@router.get("/{waiver_id}/download")
async def download_waiver(
    waiver_id: UUID,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> Response:
    """Streams a waiver's bytes through this authenticated route -- never
    a public URL, see docs/design/13-storage-abstraction.md."""
    waiver = await db.get(Waiver, waiver_id)
    if waiver is None:
        raise to_http_exception(WaiverError.NotFound)
    storage = get_storage_backend(_cfg)
    result = await stream_waiver(db, storage, waiver_id)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    return Response(
        content=result.danger_ok,
        media_type=waiver.content_type,
        headers={"Content-Disposition": "attachment; filename=waiver"},
    )
