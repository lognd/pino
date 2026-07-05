from __future__ import annotations

# Booking lifecycle: create, cancel, waitlist -- see
# docs/design/04-booking-and-scheduling.md. Every mutating function locks
# the session row (domain/booking/capacity.py) before reading/writing
# seat counts, mirroring logand.app's invoice row-lock discipline.
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select
from typani.result import Err, Ok, Result

from melpino_backend.auth.booking_tokens import (
    find_booking_by_token,
    mint_manage_token,
)
from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.waitlist_entries import WaitlistEntry
from melpino_backend.domain.booking.capacity import (
    lock_session_for_booking,
    seats_taken,
)
from melpino_backend.domain.students.service import find_or_create_student
from melpino_backend.errors import BookingError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig

logger = logging.getLogger(__name__)


@dataclass
class BookingInput:
    """Guest-submitted booking form fields -- session_id, contact info,
    party_size, attestation, sms_consent, honeypot_field."""

    session_id: UUID
    full_name: str
    email: str
    party_size: int = 1
    attestation_version: str = ""
    attestation_accepted: bool = False
    sms_consent: bool = False
    phone: str = ""
    # Bots fill this hidden field; humans never see it. The honeypot is
    # rejected at the API boundary (api/bookings.py), not here.
    honeypot_field: str = field(default="")
    # Booking origin for the site-fee metrics: 'web' for the public flow,
    # 'admin' for Mel's manual/phone entry (the on-behalf endpoint). NEVER
    # populated from client input -- api/bookings.py does not map it, so a
    # public request can only ever produce 'web'.
    source: str = "web"


def manage_url_for(cfg: "AppConfig", raw_token: str) -> str:
    """Absolute manage-page URL built from public_base_url -- the raw
    manage token lives only here and in the email/URL (see doc 02)."""
    return f"{cfg.public_base_url}/booking/{raw_token}"


def within_cancellation_window(
    starts_at: datetime, now: datetime, cancellation_hours: int
) -> bool:
    """Pure, timezone-aware cancellation-window predicate (directly
    unit-testable, incl. across a DST boundary): True when `now` is at or
    before `cancellation_hours` before `starts_at`. Both instants are real
    aware datetimes, so the subtraction is absolute elapsed time -- a DST
    jump in any local zone never distorts the boundary because the math
    is done on the underlying UTC instants."""
    deadline = starts_at - timedelta(hours=cancellation_hours)
    return now <= deadline


async def create_booking(
    db: "AsyncSession", cfg: "AppConfig", payload: BookingInput
) -> Result[tuple["Booking", str], BookingError]:
    """Locks the session row, checks capacity/status, dedups the student,
    inserts the booking, and flips the session to 'full' if now at
    capacity -- see docs/design/04's transaction description. Returns
    (booking, raw_manage_token); sends the confirmation email inline
    (best-effort, no-op when mail is unconfigured).

    JUDGMENT CALL: the scaffold stub returned Result[Booking] and took
    (db, payload). It now also takes cfg and returns the raw manage token
    -- the API contract ({booking_id, manage_url}) and the inline
    confirmation email both need the raw token, which exists nowhere else
    (only its hash is persisted). See mission report.
    """
    from melpino_backend.domain.notifications import notify

    if payload.party_size < 1:
        logger.info("create_booking rejected: party_size=%s", payload.party_size)
        return Err(BookingError.PartySizeInvalid)
    if not payload.attestation_accepted:
        logger.info("create_booking rejected: attestation not accepted")
        return Err(BookingError.AttestationRequired)

    session = await lock_session_for_booking(db, payload.session_id)
    if session is None:
        return Err(BookingError.SessionNotFound)
    if session.status == "full":
        logger.info("create_booking: session_id=%s is full", session.id)
        return Err(BookingError.SessionFull)
    now = datetime.now(timezone.utc)
    if session.status != "published" or session.starts_at <= now:
        logger.info(
            "create_booking: session_id=%s not bookable (status=%s)",
            session.id,
            session.status,
        )
        return Err(BookingError.SessionNotBookable)

    student = await find_or_create_student(
        db,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
    )

    # Explicit duplicate check for a clean error before the partial unique
    # index would raise -- one confirmed booking per (session, student).
    dup_stmt = select(Booking).where(
        Booking.session_id == session.id,
        Booking.student_id == student.id,
        Booking.status == "confirmed",
    )
    if (await db.execute(dup_stmt)).scalars().first() is not None:
        logger.info(
            "create_booking: duplicate for session_id=%s student_id=%s",
            session.id,
            student.id,
        )
        return Err(BookingError.DuplicateBooking)

    taken = await seats_taken(db, session.id)
    if taken + payload.party_size > session.capacity:
        logger.info(
            "create_booking: session_id=%s full (%d+%d>%d)",
            session.id,
            taken,
            payload.party_size,
            session.capacity,
        )
        return Err(BookingError.SessionFull)

    raw_token, token_hash = mint_manage_token()
    booking = Booking(
        session_id=session.id,
        student_id=student.id,
        party_size=payload.party_size,
        status="confirmed",
        source=payload.source,
        manage_token_hash=token_hash,
        attested_at=now,
        attestation_version=payload.attestation_version,
        sms_consent=payload.sms_consent,
    )
    db.add(booking)
    await db.flush()

    if taken + payload.party_size >= session.capacity:
        session.status = "full"
        logger.info("create_booking: session_id=%s flipped to full", session.id)
    await db.flush()
    logger.info(
        "create_booking: created booking_id=%s session_id=%s party_size=%d source=%s",
        booking.id,
        session.id,
        payload.party_size,
        payload.source,
    )

    # Deposit auto-invoice (docs/design/04's deposit contract, wired in
    # P4/docs/design/05): a course with deposit > 0 gets its deposit
    # invoiced immediately, linked via bookings.invoice_id, so the guest
    # can pay it right away from the manage page. A deposit=0 course
    # (the common case -- "pay in full/in person") never touches
    # invoices at all.
    from melpino_backend.db.models.courses import Course
    from melpino_backend.domain.invoices.service import create_deposit_invoice

    course = await db.get(Course, session.course_id)
    assert course is not None  # FK RESTRICT: a session's course always exists
    if course.deposit > 0:
        invoice, _raw_pay_token = await create_deposit_invoice(
            db,
            cfg,
            student_id=student.id,
            booking_id=booking.id,
            course_title=course.title,
            course_deposit=course.deposit,
            party_size=payload.party_size,
        )
        booking.invoice_id = invoice.id
        await db.flush()
        logger.info(
            "create_booking: booking_id=%s linked to deposit invoice_id=%s",
            booking.id,
            invoice.id,
        )

    await notify.notify_booking_confirmed(
        db, cfg, booking, manage_url_for(cfg, raw_token)
    )
    return Ok((booking, raw_token))


async def cancel_booking(
    db: "AsyncSession", cfg: "AppConfig", booking_id: UUID, *, by_admin: bool
) -> Result["Booking", BookingError]:
    """Cancels a booking inside the same session-row lock as create_booking;
    un-flips 'full' and triggers a waitlist offer if a seat freed.
    Guest cancels are rejected with CancellationWindowClosed past
    AppConfig.booking_cancellation_hours before starts_at; admin cancels
    have no window.

    JUDGMENT CALL: cfg threaded in (stub took db, booking_id, by_admin
    only) -- the cancellation-window math needs booking_cancellation_hours
    and the cancellation/waitlist emails need mail config. See report.
    """
    from melpino_backend.domain.notifications import notify

    booking = await db.get(Booking, booking_id)
    if booking is None:
        logger.info("cancel_booking: booking_id=%s not found", booking_id)
        return Err(BookingError.NotFound)
    if booking.status == "cancelled":
        logger.info("cancel_booking: booking_id=%s already cancelled", booking_id)
        return Err(BookingError.AlreadyCancelled)
    if booking.status != "confirmed":
        # attended/no_show roster entries are not cancellable online.
        logger.info(
            "cancel_booking: booking_id=%s not confirmed (status=%s)",
            booking_id,
            booking.status,
        )
        return Err(BookingError.AlreadyCancelled)

    session = await lock_session_for_booking(db, booking.session_id)
    if session is None:
        return Err(BookingError.SessionNotFound)

    # Re-check booking status under the session lock: the guard above ran
    # before we held any lock, so a concurrent double-cancel (two tabs, a
    # double-click) can both pass it under READ COMMITTED. Re-fetching with
    # FOR UPDATE and re-asserting status here makes the loser a no-op
    # instead of re-running the cancel side effects (email, waitlist offer).
    stmt = (
        select(Booking).where(Booking.id == booking_id).with_for_update()
    )
    booking = (await db.execute(stmt)).scalar_one()
    if booking.status != "confirmed":
        logger.info(
            "cancel_booking: booking_id=%s already cancelled (concurrent)",
            booking_id,
        )
        return Err(BookingError.AlreadyCancelled)

    if not by_admin:
        now = datetime.now(timezone.utc)
        if not within_cancellation_window(
            session.starts_at, now, cfg.booking_cancellation_hours
        ):
            logger.info(
                "cancel_booking: booking_id=%s past cancellation window", booking_id
            )
            return Err(BookingError.CancellationWindowClosed)

    booking.status = "cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info(
        "cancel_booking: booking_id=%s cancelled by=%s",
        booking_id,
        "admin" if by_admin else "guest",
    )

    # A cancellation always frees the session from 'full' -- re-derive the
    # stored status from the post-cancel seat count.
    taken = await seats_taken(db, session.id)
    if session.status == "full" and taken < session.capacity:
        session.status = "published"
        await db.flush()
        logger.info("cancel_booking: session_id=%s un-flipped full", session.id)

    await notify.notify_booking_cancelled(db, cfg, booking)
    # Offer sized to what THIS cancellation actually released
    # (party_size), not the session's total current free capacity -- see
    # FINDINGS.md L3: `session.capacity - taken` counts every free seat
    # regardless of whether this cancel produced it, so a 1-seat cancel on
    # a session with other pre-existing free capacity could offer to a
    # waitlist party far larger than what just opened up.
    freed = booking.party_size
    if freed > 0 and session.status != "cancelled":
        await offer_freed_seat(db, cfg, session.id, freed)
    return Ok(booking)


async def offer_freed_seat(
    db: "AsyncSession", cfg: "AppConfig", session_id: UUID, freed_capacity: int
) -> None:
    """Offers a freed seat to the OLDEST waitlist entry that fits (see
    doc 04): sends a waitlist_offer email pre-filling the booking flow and
    stamps notified_at. Offers are not exclusive holds -- first to
    complete a booking wins. Best-effort; never raises."""
    from melpino_backend.domain.notifications import notify

    stmt = (
        select(WaitlistEntry)
        .where(
            WaitlistEntry.session_id == session_id,
            WaitlistEntry.party_size <= freed_capacity,
        )
        .order_by(WaitlistEntry.created_at)
        .limit(1)
    )
    entry = (await db.execute(stmt)).scalars().first()
    if entry is None:
        logger.info("offer_freed_seat: no fitting waitlist entry for %s", session_id)
        return
    entry.notified_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info(
        "offer_freed_seat: offered session_id=%s to waitlist entry_id=%s",
        session_id,
        entry.id,
    )
    await notify.notify_waitlist_offer(db, cfg, entry.id)


async def join_waitlist(
    db: "AsyncSession", payload: BookingInput
) -> Result[None, BookingError]:
    """Adds a student to a full session's waitlist -- no seat reservation,
    no expiring claim (see docs/design/04's locked decision)."""
    from melpino_backend.db.models.class_sessions import ClassSession

    if payload.party_size < 1:
        return Err(BookingError.PartySizeInvalid)
    if not payload.attestation_accepted:
        return Err(BookingError.AttestationRequired)

    session = await db.get(ClassSession, payload.session_id)
    if session is None:
        logger.info("join_waitlist: session_id=%s not found", payload.session_id)
        return Err(BookingError.SessionNotFound)

    student = await find_or_create_student(
        db, full_name=payload.full_name, email=payload.email, phone=payload.phone
    )

    existing = (
        (
            await db.execute(
                select(WaitlistEntry).where(
                    WaitlistEntry.session_id == session.id,
                    WaitlistEntry.student_id == student.id,
                )
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        # Idempotent: already on the list is a success, not an error.
        logger.info(
            "join_waitlist: student_id=%s already waitlisted for session_id=%s",
            student.id,
            session.id,
        )
        return Ok(None)

    entry = WaitlistEntry(
        session_id=session.id, student_id=student.id, party_size=payload.party_size
    )
    db.add(entry)
    await db.flush()
    logger.info(
        "join_waitlist: student_id=%s joined session_id=%s waitlist",
        student.id,
        session.id,
    )
    return Ok(None)


async def get_booking_by_token(
    db: "AsyncSession", raw_token: str
) -> Result["Booking", BookingError]:
    """Resolves a booking from its raw manage token -- thin domain wrapper
    over auth.booking_tokens.find_booking_by_token (always TokenInvalid on
    any failure; never confirms existence to a guesser)."""
    return await find_booking_by_token(db, raw_token)


async def cancel_booking_by_token(
    db: "AsyncSession", cfg: "AppConfig", raw_token: str
) -> Result["Booking", BookingError]:
    """Guest-surface cancel: resolve the manage token to exactly one
    booking, then run the guest (windowed) cancellation."""
    result = await find_booking_by_token(db, raw_token)
    if result.is_err:
        return Err(result.danger_err)
    booking = result.danger_ok
    return await cancel_booking(db, cfg, booking.id, by_admin=False)


async def resend_confirmation(
    db: "AsyncSession", cfg: "AppConfig", raw_token: str
) -> Result[None, BookingError]:
    """Re-sends the confirmation email for the booking a manage token
    resolves to -- bypasses the reminders_sent ledger (an explicit
    user-requested resend, not the idempotent transactional send)."""
    from melpino_backend.domain.notifications import notify

    result = await find_booking_by_token(db, raw_token)
    if result.is_err:
        return Err(result.danger_err)
    booking = result.danger_ok
    logger.info("resend_confirmation: booking_id=%s", booking.id)
    await notify.notify_booking_confirmed(
        db, cfg, booking, manage_url_for(cfg, raw_token), record_ledger=False
    )
    return Ok(None)


async def mark_attended(
    db: "AsyncSession", booking_id: UUID
) -> Result[None, BookingError]:
    """Admin roster bookkeeping: confirmed -> attended."""
    return await _mark_roster(db, booking_id, "attended")


async def mark_no_show(
    db: "AsyncSession", booking_id: UUID
) -> Result[None, BookingError]:
    """Admin roster bookkeeping: confirmed -> no_show."""
    return await _mark_roster(db, booking_id, "no_show")


async def _mark_roster(
    db: "AsyncSession", booking_id: UUID, new_status: str
) -> Result[None, BookingError]:
    """Shared confirmed -> attended/no_show transition guard."""
    booking = await db.get(Booking, booking_id)
    if booking is None:
        logger.info("_mark_roster: booking_id=%s not found", booking_id)
        return Err(BookingError.NotFound)
    if booking.status == "cancelled":
        logger.info("_mark_roster: booking_id=%s already cancelled", booking_id)
        return Err(BookingError.AlreadyCancelled)
    if booking.status != "confirmed":
        logger.info(
            "_mark_roster: booking_id=%s illegal transition from %s",
            booking_id,
            booking.status,
        )
        return Err(BookingError.SessionNotBookable)
    booking.status = new_status
    await db.flush()
    logger.info("_mark_roster: booking_id=%s -> %s", booking_id, new_status)
    return Ok(None)
