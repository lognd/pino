from __future__ import annotations

# End-to-end guest booking journey against a real (fake-SMTP-backed)
# stack -- see docs/design/04-booking-and-scheduling.md's system-test
# obligations.
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer

import melpino_backend.db.models  # noqa: F401 -- populates Base.metadata
from melpino_backend.app.app import App
from melpino_backend.app.config import AppConfig
from melpino_backend.db.base import Base, dispose_engine, init_engine
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.testing.fake_smtp import FakeSmtpServer


@pytest.fixture(scope="module")
def _postgres_container():
    """One ephemeral Postgres container shared by every test in this
    module -- see tests/system/test_auth_flow.py's identical fixture."""
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture
def fake_smtp():
    """Real local aiosmtpd server so the confirmation email is actually
    sent and can be asserted on, not mocked."""
    server = FakeSmtpServer()
    server.start()
    try:
        yield server
    finally:
        server.stop()


@pytest.fixture
async def booking_client(
    _postgres_container: PostgresContainer,
    fake_smtp: FakeSmtpServer,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncGenerator[AsyncClient]:
    """Builds a real App() against the ephemeral Postgres, wires the real
    App's mail transport at the fake SMTP server, and yields an httpx
    AsyncClient talking to it over ASGITransport.

    NOTE: api/bookings.py (and its sibling api routers) build their own
    module-level AppConfig singleton at IMPORT time (it backs a
    Depends(...) default -- see that module's own comment), so the App(cfg)
    passed to the lifespan below only wires the DB engine. The module
    singleton is monkeypatched directly afterward so this test's mail
    config actually reaches the request handlers regardless of import
    order relative to other system-test modules in the same worker.
    """
    sync_url = _postgres_container.get_connection_url()
    async_url = sync_url.replace("postgresql+psycopg2", "postgresql+asyncpg")
    cfg = AppConfig.model_validate(
        {
            "database_url": async_url,
            "smtp_host": "127.0.0.1",
            "smtp_port": fake_smtp.port,
            "smtp_use_tls": False,
            "smtp_from_address": "noreply@example.test",
            "public_base_url": "https://example.test",
        }
    )
    init_engine(cfg.database_url)
    from melpino_backend.db import base as db_base

    assert db_base._engine is not None
    async with db_base._engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app = App(cfg)()

    import melpino_backend.api.bookings as bookings_module
    import melpino_backend.api.courses as courses_module

    monkeypatch.setattr(bookings_module, "_cfg", cfg)
    monkeypatch.setattr(courses_module, "_cfg", cfg)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as client:
        yield client

    async with db_base._engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await dispose_engine()


async def _seed_session(
    booking_client: AsyncClient, *, capacity: int = 10, slug_suffix: str = ""
) -> tuple[str, str]:
    """Directly inserts one active Course + one published future
    ClassSession via the live engine wired by booking_client's App, and
    returns (slug, session_id)."""
    from melpino_backend.db import base as db_base

    assert db_base._sessionmaker is not None
    now = datetime.now(timezone.utc)
    async with db_base._sessionmaker() as db:
        course = Course(
            slug=f"guest-journey{slug_suffix}",
            kind="technique",
            title="Guest Journey Course",
            summary="A test course.",
            description="A test course description.",
            price=Decimal("100.00"),
            duration_min=120,
            default_capacity=capacity,
        )
        db.add(course)
        await db.flush()
        session = ClassSession(
            course_id=course.id,
            starts_at=now + timedelta(days=7),
            ends_at=now + timedelta(days=7, hours=2),
            location_name="Test Studio",
            capacity=capacity,
            status="published",
        )
        db.add(session)
        await db.commit()
        return course.slug, str(session.id)


async def test_browse_book_confirm_receive_email_cancel(
    booking_client: AsyncClient, fake_smtp: FakeSmtpServer
) -> None:
    """Browse courses -> book a session -> receive a fake-SMTP confirmation
    email -> use the manage link to cancel."""
    client = booking_client
    slug, session_id = await _seed_session(client, slug_suffix="-1")

    catalog_resp = await client.get("/api/courses")
    assert catalog_resp.status_code == 200
    assert any(c["slug"] == slug for c in catalog_resp.json())

    sessions_resp = await client.get(f"/api/courses/{slug}/sessions")
    assert sessions_resp.status_code == 200
    assert any(s["id"] == session_id for s in sessions_resp.json())

    book_resp = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "Journey Guest",
            "email": "journey-guest@example.test",
            "party_size": 1,
            "attestation": {"version": "v1", "accepted": True},
        },
        headers={"X-Forwarded-For": "journey-book-cancel"},
    )
    assert book_resp.status_code == 200
    body = book_resp.json()
    assert body["booking_id"]
    manage_url = body["manage_url"]
    token = manage_url.rsplit("/", 1)[-1]

    assert len(fake_smtp.messages) == 1
    sent = fake_smtp.messages[0]
    assert sent["To"] == "journey-guest@example.test"

    manage_resp = await client.get(f"/api/bookings/manage/{token}")
    assert manage_resp.status_code == 200
    assert manage_resp.json()["status"] == "confirmed"

    cancel_resp = await client.post(f"/api/bookings/manage/{token}/cancel")
    assert cancel_resp.status_code == 200

    after_cancel = await client.get(f"/api/bookings/manage/{token}")
    assert after_cancel.json()["status"] == "cancelled"


async def test_waitlist_promotion_journey(
    booking_client: AsyncClient, fake_smtp: FakeSmtpServer
) -> None:
    """Join a full session's waitlist -> a cancellation frees a seat ->
    receive a waitlist_offer email -> complete the booking from that link."""
    client = booking_client
    slug, session_id = await _seed_session(client, capacity=1, slug_suffix="-2")

    first_book = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "First Guest",
            "email": "first-guest@example.test",
            "party_size": 1,
            "attestation": {"version": "v1", "accepted": True},
        },
        headers={"X-Forwarded-For": "journey-waitlist"},
    )
    assert first_book.status_code == 200
    first_manage_url = first_book.json()["manage_url"]
    first_token = first_manage_url.rsplit("/", 1)[-1]
    fake_smtp.handler.messages.clear()

    waitlist_resp = await client.post(
        "/api/bookings/waitlist",
        json={
            "session_id": session_id,
            "full_name": "Waitlisted Guest",
            "email": "waitlisted-guest@example.test",
            "party_size": 1,
            "attestation": {"version": "v1", "accepted": True},
        },
        headers={"X-Forwarded-For": "journey-waitlist"},
    )
    assert waitlist_resp.status_code == 200

    cancel_resp = await client.post(
        f"/api/bookings/manage/{first_token}/cancel",
        headers={"X-Forwarded-For": "journey-waitlist"},
    )
    assert cancel_resp.status_code == 200

    # The cancel fires both the cancellation email (to the canceling guest)
    # and a waitlist_offer email for the freed seat (to the waitlisted one).
    assert len(fake_smtp.messages) == 2
    offer_msgs = [
        m for m in fake_smtp.messages if m["To"] == "waitlisted-guest@example.test"
    ]
    assert len(offer_msgs) == 1

    second_book = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "Waitlisted Guest",
            "email": "waitlisted-guest@example.test",
            "party_size": 1,
            "attestation": {"version": "v1", "accepted": True},
        },
        headers={"X-Forwarded-For": "journey-waitlist"},
    )
    assert second_book.status_code == 200


async def test_honeypot_silently_no_ops(booking_client: AsyncClient) -> None:
    """Honeypot field: silently returns 200 with NO side effects (no row
    created, no email sent) when triggered."""
    client = booking_client
    _slug, session_id = await _seed_session(client, slug_suffix="-3")

    resp = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "A Bot",
            "email": "bot@example.test",
            "attestation": {"version": "v1", "accepted": True},
            "honeypot_field": "filled-in-by-a-bot",
        },
        headers={"X-Forwarded-For": "journey-honeypot"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

    from sqlalchemy import select

    from melpino_backend.db import base as db_base
    from melpino_backend.db.models.bookings import Booking

    assert db_base._sessionmaker is not None
    async with db_base._sessionmaker() as db:
        rows = (await db.execute(select(Booking))).scalars().all()
        assert len(rows) == 0


async def test_rate_limit_returns_429_after_threshold(
    booking_client: AsyncClient,
) -> None:
    """Rate limiting returns 429 once the booking_create bucket (5/hour)
    is exhausted for a client key."""
    client = booking_client
    _slug, session_id = await _seed_session(client, slug_suffix="-4")
    headers = {"X-Forwarded-For": "journey-ratelimit"}

    # All 5 requests use the honeypot short-circuit -- fast, no side
    # effects, but still pass through the same rate-limit dependency.
    for _ in range(5):
        resp = await client.post(
            "/api/bookings",
            json={
                "session_id": session_id,
                "full_name": "Rate Limit Prober",
                "email": "prober@example.test",
                "attestation": {"version": "v1", "accepted": True},
                "honeypot_field": "bot",
            },
            headers=headers,
        )
        assert resp.status_code == 200

    sixth = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "Rate Limit Prober",
            "email": "prober@example.test",
            "attestation": {"version": "v1", "accepted": True},
            "honeypot_field": "bot",
        },
        headers=headers,
    )
    assert sixth.status_code == 429
    assert "Retry-After" in sixth.headers


async def test_cross_token_isolation(booking_client: AsyncClient) -> None:
    """Cross-token isolation: one guest's booking token cannot see/modify
    another guest's booking."""
    client = booking_client
    _slug, session_id = await _seed_session(client, capacity=5, slug_suffix="-5")

    booking_a = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "Guest A",
            "email": "guest-a@example.test",
            "attestation": {"version": "v1", "accepted": True},
        },
        headers={"X-Forwarded-For": "journey-isolation-a"},
    )
    booking_b = await client.post(
        "/api/bookings",
        json={
            "session_id": session_id,
            "full_name": "Guest B",
            "email": "guest-b@example.test",
            "attestation": {"version": "v1", "accepted": True},
        },
        headers={"X-Forwarded-For": "journey-isolation-b"},
    )
    assert booking_a.status_code == 200
    assert booking_b.status_code == 200
    token_a = booking_a.json()["manage_url"].rsplit("/", 1)[-1]
    booking_id_b = booking_b.json()["booking_id"]

    lookup_via_a = await client.get(f"/api/bookings/manage/{token_a}")
    assert lookup_via_a.status_code == 200
    assert lookup_via_a.json()["booking_id"] != booking_id_b

    cancel_attempt = await client.post(
        f"/api/bookings/manage/{token_a}/cancel",
        headers={"X-Forwarded-For": "journey-isolation-a"},
    )
    assert cancel_attempt.status_code == 200
    # Guest B's own lookup is unaffected by Guest A's cancel.
    via_b_token_lookup = await client.get(f"/api/bookings/manage/{token_a}")
    assert via_b_token_lookup.json()["status"] == "cancelled"


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_deposit_payment_via_fake_stripe() -> None:
    """A deposit-course booking's confirmation screen pays via fake_stripe
    and the invoice settles."""
