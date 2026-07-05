from __future__ import annotations

# Integration coverage for waiver upload/storage/streaming -- see
# docs/design/06-waivers-and-legal.md and docs/design/13-storage-abstraction.md.
from uuid import uuid4

from melpino_backend.domain.storage.local import LocalFilesystemStorage
from melpino_backend.domain.waivers.service import (
    list_waivers_for_student,
    stream_waiver,
    upload_waiver,
)
from melpino_backend.errors import WaiverError


async def test_upload_waiver_round_trip(db_session, make_student, tmp_path) -> None:
    """A valid waiver upload stores the bytes and records a row; listing
    and streaming both return it."""
    student = await make_student()
    storage = LocalFilesystemStorage(tmp_path)

    result = await upload_waiver(
        db_session,
        storage,
        student_id=student.id,
        content_type="application/pdf",
        data=b"%PDF-1.4 fake waiver bytes",
    )
    assert result.is_ok
    waiver = result.danger_ok
    assert waiver.file_key == f"waivers/{student.id}/{waiver.id}.pdf"

    listed = await list_waivers_for_student(db_session, student.id)
    assert [w.id for w in listed] == [waiver.id]

    streamed = await stream_waiver(db_session, storage, waiver.id)
    assert streamed.is_ok
    assert streamed.danger_ok == b"%PDF-1.4 fake waiver bytes"


async def test_unsupported_content_type_is_rejected(
    db_session, make_student, tmp_path
) -> None:
    """Uploading a waiver with a non-allowlisted content type returns
    UnsupportedContentType."""
    student = await make_student()
    storage = LocalFilesystemStorage(tmp_path)

    result = await upload_waiver(
        db_session,
        storage,
        student_id=student.id,
        content_type="application/zip",
        data=b"not-a-waiver",
    )
    assert result.is_err
    assert result.danger_err is WaiverError.UnsupportedContentType

    listed = await list_waivers_for_student(db_session, student.id)
    assert listed == []


async def test_upload_waiver_unknown_student_returns_not_found(
    db_session, tmp_path
) -> None:
    """Uploading against a non-existent student_id returns StudentNotFound."""
    storage = LocalFilesystemStorage(tmp_path)
    result = await upload_waiver(
        db_session,
        storage,
        student_id=uuid4(),
        content_type="image/png",
        data=b"png-bytes",
    )
    assert result.is_err
    assert result.danger_err is WaiverError.StudentNotFound


async def test_stream_waiver_missing_returns_not_found(db_session, tmp_path) -> None:
    """Streaming a waiver_id with no matching row returns NotFound."""
    storage = LocalFilesystemStorage(tmp_path)
    result = await stream_waiver(db_session, storage, uuid4())
    assert result.is_err
    assert result.danger_err is WaiverError.NotFound


async def test_waiver_download_never_exposes_a_public_url(
    db_session, make_student, tmp_path
) -> None:
    """storage.url() for a waiver key is None; bytes are only ever
    streamed through the API."""
    student = await make_student()
    storage = LocalFilesystemStorage(tmp_path)
    result = await upload_waiver(
        db_session,
        storage,
        student_id=student.id,
        content_type="image/png",
        # FINDINGS.md L2: upload_waiver now sniffs magic bytes against the
        # declared content_type, so this must be real (if minimal) PNG
        # bytes rather than an arbitrary label-content mismatch.
        data=b"\x89PNG\r\n\x1a\n" + b"fake-png-body",
    )
    assert result.is_ok
    waiver = result.danger_ok
    assert await storage.url(waiver.file_key) is None
