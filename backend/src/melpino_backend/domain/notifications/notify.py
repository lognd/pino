from __future__ import annotations

# Best-effort notify_* call sites -- every function here swallows send
# failures (logged, never raised); email is a notification about
# something that already happened, never a precondition for it. See
# docs/design/04-booking-and-scheduling.md's transactional-send list and
# scheduler section. CRIB: logand.app
# backend/src/logand_backend/domain/notifications/notify.py.
#
# JUDGMENT CALL: notify_waitlist_offer's second positional arg is the
# WAITLIST ENTRY id, not a booking id (the scaffold stub misnamed it
# `booking_id` + `manage_url`). Waitlist offers are not bookings and have
# no booking row -- reminders_sent.booking_id is NOT NULL, so an offer
# cannot be ledgered there; idempotency is the entry's own notified_at,
# set by the caller (domain/booking/service.offer_freed_seat). See report.
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from melpino_backend.db.models.bookings import Booking
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.db.models.email_opt_out import EmailOptOut
from melpino_backend.db.models.reminders import ReminderSent
from melpino_backend.db.models.students import Student
from melpino_backend.db.models.waitlist_entries import WaitlistEntry
from melpino_backend.domain.notifications import mailer, templates
from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig
    from melpino_backend.db.models.invoices import Invoice

_log = get_logger(__name__)


async def _is_opted_out(db: "AsyncSession", email: str) -> bool:
    """True if this email address has unsubscribed (CAN-SPAM opt-out
    ledger) -- enforced before every commercial send."""
    stmt = select(EmailOptOut).where(EmailOptOut.email == email)
    return (await db.execute(stmt)).scalars().first() is not None


async def _already_sent(db: "AsyncSession", booking_id: UUID, kind: str) -> bool:
    """True if a (booking, kind) notification is already in the ledger."""
    stmt = select(ReminderSent).where(
        ReminderSent.booking_id == booking_id, ReminderSent.kind == kind
    )
    return (await db.execute(stmt)).scalars().first() is not None


async def _record_sent(db: "AsyncSession", booking_id: UUID, kind: str) -> None:
    """Marks a (booking, kind) notification as sent -- the idempotency
    ledger the daily sweep and transactional sends both consult.

    Wrapped in a SAVEPOINT: check-then-insert against the
    uq_reminders_sent_booking_kind unique constraint is not atomic, so a
    concurrent duplicate insert (two sweep runs racing the same booking)
    can raise IntegrityError here. Without the SAVEPOINT that exception
    poisons the whole AsyncSession, aborting every remaining booking in
    the caller's loop -- see FINDINGS.md M2. Only this failed INSERT
    rolls back; the caller treats the row as already-recorded and moves
    on, same pattern as api/webhooks.py's Payment insert.
    """
    try:
        async with db.begin_nested():
            db.add(
                ReminderSent(
                    booking_id=booking_id,
                    kind=kind,
                    sent_at=datetime.now(timezone.utc),
                )
            )
            await db.flush()
    except IntegrityError:
        _log.info(
            "_record_sent: booking_id=%s kind=%s already recorded (concurrent)",
            booking_id,
            kind,
        )


async def _session_title(db: "AsyncSession", session_id: UUID) -> str:
    """Human-readable class title for an email -- the parent course's
    title, falling back to a generic label if the row vanished."""
    stmt = (
        select(Course.title)
        .join(ClassSession, ClassSession.course_id == Course.id)
        .where(ClassSession.id == session_id)
    )
    title = (await db.execute(stmt)).scalars().first()
    return title or "your class"


async def notify_booking_confirmed(
    db: "AsyncSession",
    cfg: "AppConfig",
    booking: "Booking",
    manage_url: str,
    *,
    record_ledger: bool = True,
) -> None:
    """Sends the confirmation email; recorded in the reminders_sent ledger
    unless record_ledger is False (an explicit user-requested resend)."""
    if not mailer.is_configured(cfg):
        return
    try:
        if record_ledger and await _already_sent(db, booking.id, "confirmation"):
            _log.info("confirmation already sent booking_id=%s", booking.id)
            return
        student = await db.get(Student, booking.student_id)
        if student is None or await _is_opted_out(db, student.email):
            return
        subject, html, text = templates.booking_confirmed(
            cfg, booking_id=booking.id, manage_url=manage_url
        )
        await mailer.send_email(
            cfg,
            to_email=student.email,
            to_user_id=student.id,
            subject=subject,
            content_html=html,
            content_text=text,
        )
        if record_ledger:
            await _record_sent(db, booking.id, "confirmation")
        _log.info("sent booking-confirmed email booking_id=%s", booking.id)
    except Exception as exc:
        _log.error(
            "failed to send booking-confirmed notification",
            extra={"booking_id": str(booking.id)},
            exc_info=exc,
        )


async def notify_booking_cancelled(
    db: "AsyncSession", cfg: "AppConfig", booking: "Booking"
) -> None:
    """Sends the cancellation email."""
    if not mailer.is_configured(cfg):
        return
    try:
        if await _already_sent(db, booking.id, "cancellation"):
            return
        student = await db.get(Student, booking.student_id)
        if student is None or await _is_opted_out(db, student.email):
            return
        subject, html, text = templates.booking_cancelled(cfg, booking_id=booking.id)
        await mailer.send_email(
            cfg,
            to_email=student.email,
            to_user_id=student.id,
            subject=subject,
            content_html=html,
            content_text=text,
        )
        await _record_sent(db, booking.id, "cancellation")
        _log.info("sent booking-cancelled email booking_id=%s", booking.id)
    except Exception as exc:
        _log.error(
            "failed to send booking-cancelled notification",
            extra={"booking_id": str(booking.id)},
            exc_info=exc,
        )


async def notify_waitlist_offer(
    db: "AsyncSession", cfg: "AppConfig", entry_id: UUID
) -> None:
    """Sends a freed-seat waitlist offer to the entry the caller just
    stamped notified_at on. `entry_id` is a WAITLIST ENTRY id (see the
    module-level JUDGMENT CALL note) -- offers have no booking row."""
    if not mailer.is_configured(cfg):
        return
    try:
        entry = await db.get(WaitlistEntry, entry_id)
        if entry is None:
            return
        student = await db.get(Student, entry.student_id)
        if student is None or await _is_opted_out(db, student.email):
            return
        title = await _session_title(db, entry.session_id)
        # Pre-fills the booking flow with the freed session (offers are not
        # holds; first to complete a booking wins).
        book_url = f"{cfg.public_base_url}/book?session={entry.session_id}"
        subject, html, text = templates.waitlist_offer(
            cfg, session_title=title, manage_url=book_url
        )
        await mailer.send_email(
            cfg,
            to_email=student.email,
            to_user_id=student.id,
            subject=subject,
            content_html=html,
            content_text=text,
        )
        _log.info("sent waitlist-offer email entry_id=%s", entry_id)
    except Exception as exc:
        _log.error(
            "failed to send waitlist-offer notification",
            extra={"entry_id": str(entry_id)},
            exc_info=exc,
        )


async def notify_session_cancelled(
    db: "AsyncSession", cfg: "AppConfig", session_id: UUID
) -> None:
    """Notifies every confirmed booking on a session the admin just
    cancelled -- REQUIRED per docs/design/04."""
    if not mailer.is_configured(cfg):
        return
    stmt = select(Booking).where(
        Booking.session_id == session_id, Booking.status == "confirmed"
    )
    bookings = list((await db.execute(stmt)).scalars().all())
    _log.info(
        "notify_session_cancelled: session_id=%s -> %d confirmed booking(s)",
        session_id,
        len(bookings),
    )
    for booking in bookings:
        await notify_booking_cancelled(db, cfg, booking)


async def send_due_reminders(db: "AsyncSession", cfg: "AppConfig") -> int:
    """Sends `reminder` emails for bookings within reminder_days_before;
    idempotent via the reminders_sent unique ledger. Returns count sent."""
    if not mailer.is_configured(cfg):
        return 0
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=cfg.reminder_days_before)
    stmt = (
        select(Booking, ClassSession)
        .join(ClassSession, ClassSession.id == Booking.session_id)
        .where(
            Booking.status == "confirmed",
            ClassSession.status.in_(("published", "full")),
            ClassSession.starts_at > now,
            ClassSession.starts_at <= cutoff,
        )
    )
    rows = list((await db.execute(stmt)).all())
    sent = 0
    for booking, session in rows:
        try:
            if await _already_sent(db, booking.id, "reminder"):
                continue
            student = await db.get(Student, booking.student_id)
            if student is None or await _is_opted_out(db, student.email):
                continue
            title = await _session_title(db, session.id)
            subject, html, text = templates.booking_reminder(
                cfg, session_title=title, starts_at=session.starts_at.isoformat()
            )
            await mailer.send_email(
                cfg,
                to_email=student.email,
                to_user_id=student.id,
                subject=subject,
                content_html=html,
                content_text=text,
            )
            await _record_sent(db, booking.id, "reminder")
            # FINDINGS.md L2: commit the idempotency ledger row right
            # after the send it guards, instead of leaving it to only a
            # flush -- otherwise a later failure elsewhere in the sweep
            # (after this send, before the caller's final commit) rolls
            # back this row while the email has already gone out,
            # causing a duplicate resend tomorrow.
            await db.commit()
            sent += 1
            _log.info("sent reminder email booking_id=%s", booking.id)
        except Exception as exc:
            _log.error(
                "failed to send reminder notification",
                extra={"booking_id": str(booking.id)},
                exc_info=exc,
            )
    _log.info("send_due_reminders: sent %d reminder(s)", sent)
    return sent


async def notify_invoice_sent(
    db: "AsyncSession",
    cfg: "AppConfig",
    invoice: "Invoice",
    pay_url: str | None,
) -> None:
    """Sends the "you have an invoice" email with the pay-by-link URL --
    see docs/design/05. Best-effort, no ledger (an admin can re-send
    deliberately)."""
    if not mailer.is_configured(cfg):
        return
    try:
        student = await db.get(Student, invoice.student_id)
        if student is None or await _is_opted_out(db, student.email):
            return
        subject, html, text = templates.invoice_sent(
            cfg,
            invoice_id=invoice.id,
            amount_total=invoice.amount_total,
            currency=invoice.currency,
            due_date=invoice.due_date.isoformat() if invoice.due_date else None,
            pay_url=pay_url,
        )
        await mailer.send_email(
            cfg,
            to_email=student.email,
            to_user_id=student.id,
            subject=subject,
            content_html=html,
            content_text=text,
        )
        _log.info("sent invoice-sent email invoice_id=%s", invoice.id)
    except Exception as exc:
        _log.error(
            "failed to send invoice-sent notification",
            extra={"invoice_id": str(invoice.id)},
            exc_info=exc,
        )


async def notify_payment_received(
    db: "AsyncSession", cfg: "AppConfig", invoice: "Invoice", amount: Decimal
) -> None:
    """Sends the "we received your payment" email -- called from every
    path that settles a payment (manual, Stripe webhook, PayPal
    capture)."""
    if not mailer.is_configured(cfg):
        return
    try:
        student = await db.get(Student, invoice.student_id)
        if student is None or await _is_opted_out(db, student.email):
            return
        subject, html, text = templates.payment_received(
            cfg, invoice_id=invoice.id, amount=amount, currency=invoice.currency
        )
        await mailer.send_email(
            cfg,
            to_email=student.email,
            to_user_id=student.id,
            subject=subject,
            content_html=html,
            content_text=text,
        )
        _log.info("sent payment-received email invoice_id=%s", invoice.id)
    except Exception as exc:
        _log.error(
            "failed to send payment-received notification",
            extra={"invoice_id": str(invoice.id)},
            exc_info=exc,
        )
