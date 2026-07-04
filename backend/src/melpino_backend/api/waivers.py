from __future__ import annotations

# Waiver upload/list (admin) -- see docs/design/06-waivers-and-legal.md.
from fastapi import APIRouter, Depends, UploadFile

from melpino_backend.auth.sessions import SessionInfo, require_staff

router = APIRouter(prefix="/api/admin/waivers", tags=["admin-waivers"])


@router.post("/students/{student_id}")
async def upload_waiver(
    student_id: str, file: UploadFile, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin uploads a waiver scan for a student -- allowlisted content types only."""
    raise NotImplementedError("see docs/design/06-waivers-and-legal.md")  # TODO(impl)


@router.get("/students/{student_id}")
async def list_waivers(
    student_id: str, session: SessionInfo = Depends(require_staff)
) -> list[dict]:
    """Admin lists every waiver on file for a student."""
    raise NotImplementedError("see docs/design/06-waivers-and-legal.md")  # TODO(impl)


@router.get("/{waiver_id}/download")
async def download_waiver(
    waiver_id: str, session: SessionInfo = Depends(require_staff)
):
    """Streams a waiver's bytes through this authenticated route -- never
    a public URL, see docs/design/13-storage-abstraction.md."""
    raise NotImplementedError("see docs/design/06-waivers-and-legal.md")  # TODO(impl)
