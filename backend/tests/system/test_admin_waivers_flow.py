from __future__ import annotations

# System test: admin logs in -> uploads a waiver scan for a student ->
# lists it -> downloads the bytes back. See
# docs/design/06-waivers-and-legal.md, docs/design/13-storage-abstraction.md.
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer

import melpino_backend.db.models  # noqa: F401 -- populates Base.metadata
from melpino_backend.app.app import App
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.passwords import hash_password
from melpino_backend.db.base import Base, dispose_engine, init_engine
from melpino_backend.db.models.students import Student
from melpino_backend.db.models.users import User


@pytest.fixture(scope="module")
def _postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture
async def admin_client_with_student(_postgres_container: PostgresContainer, tmp_path):
    """Builds a real App() (local storage backend, pointed at a pytest
    tmp_path), seeds one admin user + one student, and yields an httpx
    client already logged in as that admin."""
    sync_url = _postgres_container.get_connection_url()
    async_url = sync_url.replace("postgresql+psycopg2", "postgresql+asyncpg")
    cfg = AppConfig.model_validate(
        {"database_url": async_url, "storage_local_dir": str(tmp_path)}
    )
    init_engine(cfg.database_url)
    from melpino_backend.db import base as db_base

    assert db_base._engine is not None
    async with db_base._engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    student_id = uuid4()
    assert db_base._sessionmaker is not None
    async with db_base._sessionmaker() as session:
        session.add(
            User(
                id=uuid4(),
                email="admin@example.com",
                password_hash=hash_password("correct horse battery staple"),
                role="admin",
            )
        )
        session.add(
            Student(
                id=student_id,
                full_name="Waiver Student",
                email="waiver-student@example.test",
            )
        )
        await session.commit()

    app = App(cfg)()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        login_resp = await client.post(
            "/api/auth/login",
            json={
                "email": "admin@example.com",
                "password": "correct horse battery staple",
            },
        )
        assert login_resp.status_code == 200
        client.headers["X-CSRF-Token"] = client.cookies["csrf_token"]
        yield client, student_id

    async with db_base._engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await dispose_engine()


async def test_admin_waiver_upload_list_download_flow(
    admin_client_with_student,
) -> None:
    """Full admin waiver flow: upload a PDF scan, see it in the roster
    list, and download the exact bytes back -- never via a public URL."""
    client, student_id = admin_client_with_student

    upload_resp = await client.post(
        f"/api/admin/waivers/students/{student_id}",
        files={"file": ("waiver.pdf", b"%PDF-1.4 fake waiver", "application/pdf")},
    )
    assert upload_resp.status_code == 200
    waiver = upload_resp.json()
    assert waiver["student_id"] == str(student_id)
    assert waiver["content_type"] == "application/pdf"
    assert "file_key" not in waiver  # never exposed to the client

    list_resp = await client.get(f"/api/admin/waivers/students/{student_id}")
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert len(listed) == 1
    assert listed[0]["id"] == waiver["id"]

    download_resp = await client.get(f"/api/admin/waivers/{waiver['id']}/download")
    assert download_resp.status_code == 200
    assert download_resp.content == b"%PDF-1.4 fake waiver"


async def test_admin_waiver_upload_rejects_unsupported_content_type(
    admin_client_with_student,
) -> None:
    """Uploading a .zip (not on the allowlist) returns 422."""
    client, student_id = admin_client_with_student

    resp = await client.post(
        f"/api/admin/waivers/students/{student_id}",
        files={"file": ("archive.zip", b"PK\x03\x04", "application/zip")},
    )
    assert resp.status_code == 422
