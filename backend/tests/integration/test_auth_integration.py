from __future__ import annotations

# Integration coverage for admin session lifecycle, kill-all, and guest
# booking-token round-trip/expiry/isolation -- see
# docs/design/02-auth-and-security.md. Runs against the Postgres-backed
# db_session fixture (tests/conftest.py) and its make_user/make_booking/
# make_class_session factories; skips as a whole when no Docker daemon is
# reachable (the db_session fixture skips itself).
from datetime import datetime, timedelta, timezone

from melpino_backend.auth.booking_tokens import find_booking_by_token, mint_manage_token
from melpino_backend.auth.sessions import (
    create_session,
    revoke_all_sessions_for_user,
    revoke_all_sessions_globally,
    revoke_session,
    validate_session,
)
from melpino_backend.errors import BookingError


async def test_create_then_validate_session_round_trip(db_session, make_user) -> None:
    """A freshly created admin session validates and resolves the same user."""
    user = await make_user(role="admin")

    create_result = await create_session(db_session, user.id, role="admin")
    assert create_result.is_ok
    raw_token, _ = create_result.danger_ok

    validate_result = await validate_session(db_session, raw_token)
    assert validate_result.is_ok
    assert validate_result.danger_ok.user_id == user.id


async def test_revoked_session_no_longer_validates(db_session, make_user) -> None:
    """revoke_session makes a subsequent validate_session return an Err."""
    user = await make_user(role="admin")

    create_result = await create_session(db_session, user.id, role="admin")
    raw_token, session = create_result.danger_ok

    await revoke_session(db_session, session.id)
    validate_result = await validate_session(db_session, raw_token)
    assert validate_result.is_err


async def test_unknown_token_fails_to_validate(db_session) -> None:
    """A raw token that was never issued fails validation."""
    result = await validate_session(db_session, "not-a-real-token")
    assert result.is_err


async def test_session_idle_timeout_slides_forward_on_validate(
    db_session, make_user
) -> None:
    """Each successful validate_session pushes expires_at further out,
    capped by the 7-day absolute lifetime."""
    user = await make_user(role="admin")
    create_result = await create_session(db_session, user.id, role="admin")
    raw_token, info = create_result.danger_ok
    first_expiry = info.expires_at

    validate_result = await validate_session(db_session, raw_token)
    assert validate_result.is_ok
    assert validate_result.danger_ok.expires_at >= first_expiry


async def test_session_expiry_is_capped_at_absolute_max_lifetime(
    db_session, make_user
) -> None:
    """A session created long ago cannot slide its idle window past the
    7-day absolute cap measured from created_at."""
    from melpino_backend.db.models.sessions import Session

    user = await make_user(role="admin")
    create_result = await create_session(db_session, user.id, role="admin")
    raw_token, info = create_result.danger_ok

    row = await db_session.get(Session, info.id)
    row.created_at = datetime.now(timezone.utc) - timedelta(
        days=6, hours=23, minutes=58
    )
    await db_session.flush()

    validate_result = await validate_session(db_session, raw_token)
    assert validate_result.is_ok
    session = validate_result.danger_ok

    absolute_cap = row.created_at + timedelta(days=7)
    assert session.expires_at <= absolute_cap + timedelta(seconds=1)


async def test_revoke_all_sessions_for_user_only_affects_that_user(
    db_session, make_user
) -> None:
    """revoke_all_sessions_for_user(user_a) leaves user_b's session valid."""
    user_a = await make_user(role="admin")
    user_b = await make_user(role="admin")

    token_a, _ = (await create_session(db_session, user_a.id, role="admin")).danger_ok
    token_b, _ = (await create_session(db_session, user_b.id, role="admin")).danger_ok

    await revoke_all_sessions_for_user(db_session, user_a.id)

    assert (await validate_session(db_session, token_a)).is_err
    assert (await validate_session(db_session, token_b)).is_ok


async def test_revoke_all_sessions_globally_kills_every_session(
    db_session, make_user
) -> None:
    """The 'kill all sessions' nuclear option invalidates every session,
    including the caller's own."""
    user_a = await make_user(role="admin")
    user_b = await make_user(role="staff")

    token_a, _ = (await create_session(db_session, user_a.id, role="admin")).danger_ok
    token_b, _ = (await create_session(db_session, user_b.id, role="staff")).danger_ok

    await revoke_all_sessions_globally(db_session)

    assert (await validate_session(db_session, token_a)).is_err
    assert (await validate_session(db_session, token_b)).is_err


async def test_manage_token_round_trip_fetches_the_right_booking(
    db_session, make_booking
) -> None:
    """The raw token minted at booking creation fetches that exact booking."""
    raw_token, token_hash = mint_manage_token()
    booking = await make_booking(manage_token_hash=token_hash)

    result = await find_booking_by_token(db_session, raw_token)
    assert result.is_ok
    assert result.danger_ok.id == booking.id


async def test_manage_token_wrong_token_returns_token_invalid(
    db_session, make_booking
) -> None:
    """A token that was never minted for any booking returns TokenInvalid,
    not a distinct 'not found' status (never confirm existence to a
    guesser)."""
    _, token_hash = mint_manage_token()
    await make_booking(manage_token_hash=token_hash)

    result = await find_booking_by_token(db_session, "totally-wrong-token")
    assert result.is_err
    assert result.danger_err is BookingError.TokenInvalid


async def test_manage_token_expires_30_days_after_session_end(
    db_session, make_booking, make_class_session
) -> None:
    """A manage token past its session's end + 30 days returns TokenInvalid."""
    ended_session = await make_class_session(
        ends_at=datetime.now(timezone.utc) - timedelta(days=31)
    )
    raw_token, token_hash = mint_manage_token()
    await make_booking(
        session_id=ended_session.id, manage_token_hash=token_hash
    )

    result = await find_booking_by_token(db_session, raw_token)
    assert result.is_err
    assert result.danger_err is BookingError.TokenInvalid


async def test_manage_token_still_valid_within_30_day_grace_window(
    db_session, make_booking, make_class_session
) -> None:
    """A manage token for a session that ended 10 days ago (inside the
    30-day grace window) still resolves."""
    recently_ended_session = await make_class_session(
        ends_at=datetime.now(timezone.utc) - timedelta(days=10)
    )
    raw_token, token_hash = mint_manage_token()
    booking = await make_booking(
        session_id=recently_ended_session.id, manage_token_hash=token_hash
    )

    result = await find_booking_by_token(db_session, raw_token)
    assert result.is_ok
    assert result.danger_ok.id == booking.id


async def test_manage_tokens_are_isolated_across_bookings(
    db_session, make_booking
) -> None:
    """Booking A's token never resolves to booking B (cross-booking
    isolation, per doc 02's required test list)."""
    raw_token_a, hash_a = mint_manage_token()
    _, hash_b = mint_manage_token()
    booking_a = await make_booking(manage_token_hash=hash_a)
    await make_booking(manage_token_hash=hash_b)

    result = await find_booking_by_token(db_session, raw_token_a)
    assert result.is_ok
    assert result.danger_ok.id == booking_a.id
