from __future__ import annotations

# Integration coverage for the one real race in this codebase -- see
# docs/design/04-booking-and-scheduling.md's capacity-locking section.
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from melpino_backend.app.config import AppConfig
from melpino_backend.domain.booking.service import (
    BookingInput,
    cancel_booking,
    create_booking,
)
from melpino_backend.domain.booking.sweep import run_daily_sweep
from melpino_backend.domain.courses.service import cancel_session
from melpino_backend.errors import BookingError
from melpino_backend.testing.fake_smtp import FakeSmtpServer


@pytest.fixture
def fake_smtp() -> Any:
    """Real local aiosmtpd server; started/stopped per test."""
    server = FakeSmtpServer()
    server.start()
    try:
        yield server
    finally:
        server.stop()


@pytest.fixture
def mail_config(app_config: AppConfig, fake_smtp: FakeSmtpServer) -> AppConfig:
    """app_config with real SMTP transport pointed at the fake server."""
    return app_config.model_copy(
        update={
            "smtp_host": "127.0.0.1",
            "smtp_port": fake_smtp.port,
            "smtp_use_tls": False,
            "smtp_from_address": "noreply@example.test",
        }
    )


async def test_concurrent_last_seat_race(_pg_url: str, app_config: AppConfig) -> None:
    """Two concurrent create_booking calls for a 1-seat session --
    exactly one succeeds."""
    engine = create_async_engine(_pg_url)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        from melpino_backend.db.models.class_sessions import ClassSession
        from melpino_backend.db.models.courses import Course

        now = datetime.now(timezone.utc)
        async with sessionmaker() as seed:
            course = Course(
                slug="race-course",
                kind="technique",
                title="Race Course",
                summary="s",
                description="d",
                price=0,
                duration_min=60,
                default_capacity=1,
            )
            seed.add(course)
            await seed.flush()
            class_session = ClassSession(
                course_id=course.id,
                starts_at=now + timedelta(days=7),
                ends_at=now + timedelta(days=7, hours=1),
                location_name="Studio",
                capacity=1,
                status="published",
            )
            seed.add(class_session)
            await seed.commit()
            session_id = class_session.id

        async def attempt(email: str):
            async with sessionmaker() as db:
                payload = BookingInput(
                    session_id=session_id,
                    full_name=f"Guest {email}",
                    email=email,
                    attestation_accepted=True,
                    attestation_version="v1",
                )
                result = await create_booking(db, app_config, payload)
                await db.commit()
                return result

        results = await asyncio.gather(
            attempt("racer-a@example.test"), attempt("racer-b@example.test")
        )
        oks = [r for r in results if r.is_ok]
        errs = [r for r in results if r.is_err]
        assert len(oks) == 1, "exactly one concurrent booking must win the last seat"
        assert len(errs) == 1
        assert errs[0].danger_err is BookingError.SessionFull
    finally:
        await engine.dispose()


async def test_waitlist_offer_on_cancellation_picks_oldest_that_fits(
    db_session: AsyncSession,
    app_config: AppConfig,
    make_class_session: Any,
    make_booking: Any,
    make_student: Any,
) -> None:
    """Cancelling a booking offers the freed seat to the oldest
    waitlist entry that fits."""
    from melpino_backend.db.models.waitlist_entries import WaitlistEntry

    session = await make_class_session(capacity=1)
    booking = await make_booking(session_id=session.id)

    older_student = await make_student()
    newer_student = await make_student()
    older_entry = WaitlistEntry(
        session_id=session.id, student_id=older_student.id, party_size=1
    )
    db_session.add(older_entry)
    await db_session.flush()
    newer_entry = WaitlistEntry(
        session_id=session.id, student_id=newer_student.id, party_size=1
    )
    db_session.add(newer_entry)
    await db_session.flush()
    # A too-large entry created even earlier must be skipped in favor of
    # the oldest entry that actually FITS the freed capacity.
    too_big_student = await make_student()
    too_big_entry = WaitlistEntry(
        session_id=session.id, student_id=too_big_student.id, party_size=5
    )
    db_session.add(too_big_entry)
    await db_session.flush()

    result = await cancel_booking(db_session, app_config, booking.id, by_admin=True)
    assert result.is_ok

    await db_session.refresh(older_entry)
    await db_session.refresh(newer_entry)
    await db_session.refresh(too_big_entry)
    assert older_entry.notified_at is not None
    assert newer_entry.notified_at is None
    assert too_big_entry.notified_at is None


async def test_reminder_ledger_idempotency(
    db_session: AsyncSession,
    mail_config: AppConfig,
    make_class_session: Any,
    make_booking: Any,
    fake_smtp: FakeSmtpServer,
) -> None:
    """Running the reminder sweep twice sends exactly one email per booking."""
    now = datetime.now(timezone.utc)
    session = await make_class_session(
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=1, hours=2),
        status="published",
    )
    await make_booking(session_id=session.id)

    first_sent, _ = await run_daily_sweep(db_session, mail_config)
    assert first_sent == 1
    assert len(fake_smtp.messages) == 1

    second_sent, _ = await run_daily_sweep(db_session, mail_config)
    assert second_sent == 0
    assert len(fake_smtp.messages) == 1


async def test_session_cancel_notifies_every_confirmed_booking(
    db_session: AsyncSession,
    mail_config: AppConfig,
    make_class_session: Any,
    make_booking: Any,
    fake_smtp: FakeSmtpServer,
) -> None:
    """Admin-cancelling a session with confirmed bookings emails every one of them."""
    session = await make_class_session(capacity=5)
    await make_booking(session_id=session.id)
    await make_booking(session_id=session.id)
    await make_booking(session_id=session.id)

    result = await cancel_session(db_session, mail_config, session.id)
    assert result.is_ok
    assert len(fake_smtp.messages) == 3
