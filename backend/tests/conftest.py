from __future__ import annotations

# Shared pytest fixtures -- db engine/session, AppConfig, model
# factories. See docs/design/12-testing-strategy.md. The db_session
# fixture builds its schema via Base.metadata.create_all() (fast, per
# doc 12); the real Alembic chain is exercised separately by
# tests/integration/test_migrations.py, which deliberately manages its
# own throwaway container and does NOT use these fixtures.
import asyncio
import shutil
import subprocess
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from melpino_backend.app.config import AppConfig
from melpino_backend.db.base import Base
from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.db.models.students import Student
from melpino_backend.db.models.users import User


def _docker_available() -> bool:
    """True if a Docker daemon is reachable -- gates every fixture that
    needs a throwaway Postgres container."""
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "info"], capture_output=True, timeout=10
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


@pytest.fixture(scope="session")
def _pg_url() -> Any:
    """Starts one session-wide throwaway Postgres container, creates the
    ORM schema once, and yields its asyncpg URL; skips cleanly when no
    Docker daemon is reachable."""
    if not _docker_available():
        pytest.skip("no Docker daemon reachable -- db-backed tests need Postgres")
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("psycopg2", "asyncpg")

        async def _create_all() -> None:
            engine = create_async_engine(url)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            await engine.dispose()

        asyncio.run(_create_all())
        yield url


@pytest.fixture
async def db_session(_pg_url: str) -> AsyncGenerator[AsyncSession]:
    """Yields an AsyncSession inside an outer transaction that is rolled
    back after each test -- commits inside the test become savepoint
    releases, so tests stay isolated without truncating tables."""
    engine = create_async_engine(_pg_url)
    conn = await engine.connect()
    trans = await conn.begin()
    session = AsyncSession(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()
        await engine.dispose()


@pytest.fixture
def app_config() -> AppConfig:
    """An AppConfig with test-safe defaults -- fake payment/mail API bases
    so nothing in a test can ever reach a real external service."""
    return AppConfig(
        session_secret="test-only-secret",
        stripe_api_base="http://127.0.0.1:1/fake-stripe",
        paypal_api_base="http://127.0.0.1:1/fake-paypal",
        gmail_api_base="http://127.0.0.1:1/fake-gmail",
        gmail_token_api_base="http://127.0.0.1:1/fake-gmail-token",
    )


@pytest.fixture
def make_user(db_session: AsyncSession) -> Any:
    """Factory fixture: persists a User with unique email and a fixed
    (pre-hashed-free) placeholder password hash unless overridden."""

    async def _make(**overrides: Any) -> User:
        fields: dict[str, Any] = {
            "email": f"user-{uuid.uuid4().hex[:12]}@example.test",
            "password_hash": "x" * 32,
            "role": "admin",
        }
        fields.update(overrides)
        user = User(**fields)
        db_session.add(user)
        await db_session.flush()
        return user

    return _make


@pytest.fixture
def make_student(db_session: AsyncSession) -> Any:
    """Factory fixture: persists a Student with a unique email."""

    async def _make(**overrides: Any) -> Student:
        fields: dict[str, Any] = {
            "full_name": "Test Student",
            "email": f"student-{uuid.uuid4().hex[:12]}@example.test",
        }
        fields.update(overrides)
        student = Student(**fields)
        db_session.add(student)
        await db_session.flush()
        return student

    return _make


@pytest.fixture
def make_course(db_session: AsyncSession) -> Any:
    """Factory fixture: persists a Course with sane class-kind defaults."""

    async def _make(**overrides: Any) -> Course:
        fields: dict[str, Any] = {
            "slug": f"course-{uuid.uuid4().hex[:12]}",
            "kind": "technique",
            "title": "Test Course",
            "summary": "A test course.",
            "description": "A test course description.",
            "price": Decimal("100.00"),
            "duration_min": 120,
            "default_capacity": 10,
        }
        fields.update(overrides)
        course = Course(**fields)
        db_session.add(course)
        await db_session.flush()
        return course

    return _make


@pytest.fixture
def make_class_session(db_session: AsyncSession, make_course: Any) -> Any:
    """Factory fixture: persists a ClassSession (auto-creating a parent
    Course unless course_id is supplied); pass starts_at/ends_at to
    control the schedule."""

    async def _make(**overrides: Any) -> ClassSession:
        if "course_id" not in overrides:
            course = await make_course()
            overrides["course_id"] = course.id
        ends_at = overrides.pop(
            "ends_at", datetime.now(timezone.utc) + timedelta(days=7, hours=2)
        )
        starts_at = overrides.pop("starts_at", ends_at - timedelta(hours=2))
        fields: dict[str, Any] = {
            "starts_at": starts_at,
            "ends_at": ends_at,
            "location_name": "Test Studio",
            "capacity": 10,
        }
        fields.update(overrides)
        class_session = ClassSession(**fields)
        db_session.add(class_session)
        await db_session.flush()
        return class_session

    return _make


@pytest.fixture
def make_booking(
    db_session: AsyncSession, make_class_session: Any, make_student: Any
) -> Any:
    """Factory fixture: persists a confirmed Booking (auto-creating its
    ClassSession and Student unless session_id/student_id are supplied)."""

    async def _make(**overrides: Any) -> Booking:
        if "session_id" not in overrides:
            class_session = await make_class_session()
            overrides["session_id"] = class_session.id
        if "student_id" not in overrides:
            student = await make_student()
            overrides["student_id"] = student.id
        fields: dict[str, Any] = {
            "manage_token_hash": uuid.uuid4().hex + uuid.uuid4().hex,
            "attested_at": datetime.now(timezone.utc),
            "attestation_version": "test-v1",
        }
        fields.update(overrides)
        booking = Booking(**fields)
        db_session.add(booking)
        await db_session.flush()
        return booking

    return _make
