from __future__ import annotations

# Integration coverage for bookings.source (web vs admin-manual origin,
# the owner's site-fee billing data) and the subscribable ICS feed.
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api import calendar as calendar_api
from melpino_backend.api.admin_metrics import bookings_by_source
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.sessions import require_staff
from melpino_backend.db.base import get_db
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.domain.booking.service import (
    BookingInput,
    cancel_booking,
    create_booking,
)


async def _seed_session(db: AsyncSession, *, capacity: int = 10) -> ClassSession:
    now = datetime.now(timezone.utc)
    course = Course(
        slug=f"metrics-course-{now.timestamp()}",
        kind="technique",
        title="Metrics Course",
        summary="s",
        description="d",
        price=0,
        duration_min=60,
        default_capacity=capacity,
    )
    db.add(course)
    await db.flush()
    session = ClassSession(
        course_id=course.id,
        starts_at=now + timedelta(days=7),
        ends_at=now + timedelta(days=7, hours=2),
        location_name="Studio",
        location_addr="100 Main St",
        capacity=capacity,
        status="published",
    )
    db.add(session)
    await db.flush()
    return session


def _payload(session_id: object, email: str, **overrides: object) -> BookingInput:
    fields: dict = {
        "session_id": session_id,
        "full_name": f"Guest {email}",
        "email": email,
        "attestation_accepted": True,
        "attestation_version": "v1",
    }
    fields.update(overrides)
    return BookingInput(**fields)


async def test_public_bookings_default_to_web_source(
    db_session: AsyncSession, app_config: AppConfig
) -> None:
    session = await _seed_session(db_session)
    result = await create_booking(
        db_session, app_config, _payload(session.id, "web@example.test")
    )
    assert result.is_ok
    booking, _token = result.danger_ok
    assert booking.source == "web"


async def test_admin_source_is_persisted(
    db_session: AsyncSession, app_config: AppConfig
) -> None:
    session = await _seed_session(db_session)
    result = await create_booking(
        db_session,
        app_config,
        _payload(session.id, "phone@example.test", source="admin"),
    )
    assert result.is_ok
    booking, _token = result.danger_ok
    assert booking.source == "admin"


async def test_metrics_split_by_source_and_exclude_cancelled(
    db_session: AsyncSession, app_config: AppConfig
) -> None:
    session = await _seed_session(db_session)
    web_emails = ["a@example.test", "b@example.test"]
    for email in web_emails:
        assert (
            await create_booking(db_session, app_config, _payload(session.id, email))
        ).is_ok
    admin_result = await create_booking(
        db_session,
        app_config,
        _payload(session.id, "manual@example.test", source="admin", party_size=3),
    )
    assert admin_result.is_ok
    # One web booking cancelled -> excluded from the counts entirely.
    cancelled = await create_booking(
        db_session, app_config, _payload(session.id, "gone@example.test")
    )
    assert cancelled.is_ok
    cancel = await cancel_booking(
        db_session, app_config, cancelled.danger_ok[0].id, by_admin=True
    )
    assert cancel.is_ok

    data = await bookings_by_source(db=db_session, _admin=None)  # type: ignore[arg-type]
    assert data["totals"]["web"] == {"bookings": 2, "seats": 2}
    assert data["totals"]["admin"] == {"bookings": 1, "seats": 3}
    assert len(data["monthly"]) == 1
    month = data["monthly"][0]
    assert month["month"] == datetime.now(timezone.utc).strftime("%Y-%m")
    assert month["web"]["bookings"] == 2
    assert month["admin"]["seats"] == 3


async def test_calendar_feed_requires_the_key_and_serves_sessions(
    db_session: AsyncSession, app_config: AppConfig, monkeypatch: object
) -> None:
    session = await _seed_session(db_session)
    booked = await create_booking(
        db_session, app_config, _payload(session.id, "seat@example.test", party_size=2)
    )
    assert booked.is_ok
    await db_session.commit()

    keyed_cfg = app_config.model_copy(update={"calendar_feed_key": "feed-secret-1"})
    monkeypatch.setattr(calendar_api, "_cfg", keyed_cfg)  # type: ignore[attr-defined]

    app = FastAPI()
    app.include_router(calendar_api.router)

    async def _db_override() -> object:
        yield db_session

    app.dependency_overrides[get_db] = _db_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        missing = await client.get("/api/calendar/feed.ics")
        assert missing.status_code == 404
        wrong = await client.get("/api/calendar/feed.ics", params={"key": "nope"})
        assert wrong.status_code == 404
        ok = await client.get("/api/calendar/feed.ics", params={"key": "feed-secret-1"})
        assert ok.status_code == 200
        assert ok.headers["content-type"].startswith("text/calendar")
        body = ok.text
        assert f"UID:session-{session.id}@melpino" in body
        assert "SUMMARY:Metrics Course" in body
        assert "2/10 seats booked" in body


async def test_admin_feed_url_reflects_configuration(
    db_session: AsyncSession, app_config: AppConfig, monkeypatch: object
) -> None:
    keyed_cfg = app_config.model_copy(
        update={
            "calendar_feed_key": "feed-secret-2",
            "public_base_url": "https://example.test",
        }
    )
    monkeypatch.setattr(calendar_api, "_cfg", keyed_cfg)  # type: ignore[attr-defined]
    app = FastAPI()
    app.include_router(calendar_api.admin_router)
    app.dependency_overrides[require_staff] = lambda: None
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/admin/calendar/feed-url")
        assert res.status_code == 200
        assert (
            res.json()["feed_url"]
            == "https://example.test/api/calendar/feed.ics?key=feed-secret-2"
        )
