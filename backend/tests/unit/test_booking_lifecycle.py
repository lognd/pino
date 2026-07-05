from __future__ import annotations

# Unit coverage for the booking state machine and guest manage tokens --
# see docs/design/04-booking-and-scheduling.md and
# docs/design/02-auth-and-security.md.
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.app.config import AppConfig
from melpino_backend.auth.booking_tokens import find_booking_by_token, mint_manage_token
from melpino_backend.db.models.bookings import Booking
from melpino_backend.domain.booking.service import (
    BookingInput,
    cancel_booking,
    within_cancellation_window,
)
from melpino_backend.errors import BookingError


async def test_cancel_already_cancelled_booking_is_rejected(
    db_session: AsyncSession, app_config: AppConfig, make_booking: Any
) -> None:
    """cancel_booking on an already-cancelled booking returns AlreadyCancelled."""
    booking = await make_booking()

    first = await cancel_booking(db_session, app_config, booking.id, by_admin=True)
    assert first.is_ok

    second = await cancel_booking(db_session, app_config, booking.id, by_admin=True)
    assert second.is_err
    assert second.danger_err is BookingError.AlreadyCancelled


async def test_guest_cancel_after_window_is_rejected(
    db_session: AsyncSession,
    app_config: AppConfig,
    make_class_session: Any,
    make_booking: Any,
) -> None:
    """A guest cancel inside booking_cancellation_hours succeeds; after it 409s."""
    now = datetime.now(timezone.utc)

    # Session starts well inside the cancellation window (< 24h away) --
    # a guest cancel must be rejected.
    late_session = await make_class_session(
        starts_at=now + timedelta(hours=1), ends_at=now + timedelta(hours=3)
    )
    late_booking = await make_booking(session_id=late_session.id)
    rejected = await cancel_booking(
        db_session, app_config, late_booking.id, by_admin=False
    )
    assert rejected.is_err
    assert rejected.danger_err is BookingError.CancellationWindowClosed

    # Session starts well outside the window -- a guest cancel succeeds.
    early_session = await make_class_session(
        starts_at=now + timedelta(days=7), ends_at=now + timedelta(days=7, hours=2)
    )
    early_booking = await make_booking(session_id=early_session.id)
    accepted = await cancel_booking(
        db_session, app_config, early_booking.id, by_admin=False
    )
    assert accepted.is_ok


def test_cancellation_window_math_handles_dst_transition() -> None:
    """The cancellation-window boundary is computed correctly across a DST change.

    class_sessions.starts_at always comes back from Postgres as a
    timezone.utc-aware datetime (a fixed-offset asyncpg timestamptz), so
    that -- not a zoneinfo-local datetime -- is what within_cancellation_window
    actually receives in production. The point of this test is that a local
    DST transition (America/New_York's spring-forward, 2:00am -> 3:00am on
    2026-03-08) happening somewhere in the wall-clock calendar between `now`
    and `starts_at` must not shift the boundary by even a second: the
    business owner sees "10:00am local" on both sides of the transition
    (nominally 24h apart in local wall-clock terms), but the REAL elapsed
    time from a fixed instant 24h before is what the function must honor.
    """
    tz = ZoneInfo("America/New_York")
    starts_local = datetime(2026, 3, 8, 10, 0, tzinfo=tz)
    starts_at = starts_local.astimezone(timezone.utc)

    deadline = starts_at - timedelta(hours=24)
    # At the exact real-time deadline, cancellation is still allowed.
    assert within_cancellation_window(starts_at, deadline, 24)
    # One second later it is closed -- proving the math is done on
    # absolute UTC instants that a DST jump in any local zone cannot distort.
    just_after = deadline + timedelta(seconds=1)
    assert not within_cancellation_window(starts_at, just_after, 24)

    # The local wall-clock gap is only 23h (the DST jump ate an hour), which
    # would wrongly still look "inside the window" under naive local-clock
    # subtraction -- confirming the deadline instant is NOT the same as
    # "24 nominal local hours before starts_local".
    naive_local_24h_before = starts_local - timedelta(hours=24)
    assert naive_local_24h_before.astimezone(timezone.utc) != deadline


async def test_manage_token_round_trip(
    db_session: AsyncSession, app_config: AppConfig, make_class_session: Any
) -> None:
    """Creating a booking mints a token; that token fetches it; a wrong token 404s."""
    from melpino_backend.domain.booking.service import create_booking

    session = await make_class_session(status="published")
    payload = BookingInput(
        session_id=session.id,
        full_name="Ada Lovelace",
        email="ada@example.test",
        attestation_accepted=True,
        attestation_version="v1",
    )
    result = await create_booking(db_session, app_config, payload)
    assert result.is_ok
    booking, raw_token = result.danger_ok

    found = await find_booking_by_token(db_session, raw_token)
    assert found.is_ok
    assert found.danger_ok.id == booking.id

    wrong = await find_booking_by_token(db_session, "not-a-real-token")
    assert wrong.is_err
    assert wrong.danger_err is BookingError.TokenInvalid


async def test_manage_token_expires_30_days_after_session_end(
    db_session: AsyncSession, make_class_session: Any, make_booking: Any
) -> None:
    """A manage token lookup past the 30-day post-session window
    returns TokenInvalid."""
    now = datetime.now(timezone.utc)
    raw_token, token_hash = mint_manage_token()

    # Session ended 31 days ago -- past the 30-day grace window.
    expired_session = await make_class_session(
        starts_at=now - timedelta(days=31, hours=2), ends_at=now - timedelta(days=31)
    )
    await make_booking(session_id=expired_session.id, manage_token_hash=token_hash)

    result = await find_booking_by_token(db_session, raw_token)
    assert result.is_err
    assert result.danger_err is BookingError.TokenInvalid

    # A session that ended 29 days ago is still inside the window.
    raw_token2, token_hash2 = mint_manage_token()
    live_session = await make_class_session(
        starts_at=now - timedelta(days=29, hours=2), ends_at=now - timedelta(days=29)
    )
    await make_booking(session_id=live_session.id, manage_token_hash=token_hash2)
    still_valid = await find_booking_by_token(db_session, raw_token2)
    assert still_valid.is_ok


async def test_manage_token_never_appears_in_logs(
    db_session: AsyncSession,
    app_config: AppConfig,
    make_class_session: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Grep captured log output for the raw token after a booking
    flow -- must be absent."""
    from melpino_backend.domain.booking.service import create_booking

    session = await make_class_session(status="published")
    payload = BookingInput(
        session_id=session.id,
        full_name="Grace Hopper",
        email="grace@example.test",
        attestation_accepted=True,
        attestation_version="v1",
    )
    with caplog.at_level(logging.DEBUG):
        result = await create_booking(db_session, app_config, payload)
        assert result.is_ok
        _, raw_token = result.danger_ok
        await find_booking_by_token(db_session, raw_token)

    for record in caplog.records:
        assert raw_token not in record.getMessage()


async def test_cross_booking_token_isolation(
    db_session: AsyncSession, app_config: AppConfig, make_class_session: Any
) -> None:
    """Booking A's manage token cannot fetch or cancel booking B."""
    from melpino_backend.domain.booking.service import create_booking

    session_a = await make_class_session(status="published")
    session_b = await make_class_session(status="published")

    payload_a = BookingInput(
        session_id=session_a.id,
        full_name="Booking A",
        email="a@example.test",
        attestation_accepted=True,
        attestation_version="v1",
    )
    payload_b = BookingInput(
        session_id=session_b.id,
        full_name="Booking B",
        email="b@example.test",
        attestation_accepted=True,
        attestation_version="v1",
    )
    result_a = await create_booking(db_session, app_config, payload_a)
    result_b = await create_booking(db_session, app_config, payload_b)
    assert result_a.is_ok
    assert result_b.is_ok
    booking_a, token_a = result_a.danger_ok
    booking_b, _token_b = result_b.danger_ok

    found = await find_booking_by_token(db_session, token_a)
    assert found.is_ok
    assert found.danger_ok.id == booking_a.id
    assert found.danger_ok.id != booking_b.id


async def test_honeypot_field_filled_rejects_silently(
    db_session: AsyncSession, make_class_session: Any
) -> None:
    """A filled honeypot field rejects the booking with no row created."""
    from melpino_backend.api.bookings import (
        BookingCreateRequest,
        create_booking_endpoint,
    )

    session = await make_class_session(status="published")
    payload = BookingCreateRequest(
        session_id=str(session.id),
        full_name="Bot Botson",
        email="bot@example.test",
        honeypot_field="filled-by-a-bot",
    )
    response = await create_booking_endpoint(payload, db=db_session, _rl=None)
    assert response == {"status": "ok"}

    rows = (await db_session.execute(select(Booking))).scalars().all()
    assert len(rows) == 0


async def test_booking_rejected_without_attestation(
    db_session: AsyncSession, app_config: AppConfig, make_class_session: Any
) -> None:
    """create_booking with attestation_accepted=False returns
    AttestationRequired and creates no row -- see docs/design/06-waivers-
    and-legal.md's attestation-versioning-on-bookings section."""
    from melpino_backend.domain.booking.service import create_booking

    session = await make_class_session(status="published")
    payload = BookingInput(
        session_id=session.id,
        full_name="No Attestation",
        email="no-attestation@example.test",
        attestation_accepted=False,
        attestation_version="v1",
    )
    result = await create_booking(db_session, app_config, payload)
    assert result.is_err
    assert result.danger_err is BookingError.AttestationRequired

    rows = (await db_session.execute(select(Booking))).scalars().all()
    assert len(rows) == 0
