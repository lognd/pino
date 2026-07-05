from __future__ import annotations

# Guest booking create/lookup/cancel via manage tokens -- see
# docs/design/04-booking-and-scheduling.md's public API surface and
# docs/design/02-auth-and-security.md's rate limits/honeypot. This route's
# POSTs are CSRF-exempt (no session cookie exists for guests at all, see
# app/app.py) and are the highest-abuse surface in this backend.
import argparse
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.rate_limit import (
    BOOKING_CREATE,
    BOOKING_MANAGE_LOOKUP,
    rate_limit,
)
from melpino_backend.db.base import get_db
from melpino_backend.db.models.class_sessions import ClassSession
from melpino_backend.db.models.courses import Course
from melpino_backend.domain.booking.service import (
    BookingInput,
    cancel_booking_by_token,
    create_booking,
    get_booking_by_token,
    join_waitlist,
    manage_url_for,
    resend_confirmation,
    within_cancellation_window,
)
from melpino_backend.errors import BookingError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

# RateLimiter is constructed once at import time (it backs a Depends
# default), so redis_url comes from config here too -- see api/auth.py.
_cfg = AppConfig.from_external(argparse.Namespace())
_rl_create = rate_limit("booking_create", *BOOKING_CREATE, redis_url=_cfg.redis_url)
_rl_manage = rate_limit(
    "booking_manage", *BOOKING_MANAGE_LOOKUP, redis_url=_cfg.redis_url
)


class AttestationInput(BaseModel):
    """The eligibility attestation the booker agreed to (see doc 06)."""

    model_config = {}

    version: str = ""
    accepted: bool = False


class BookingCreateRequest(BaseModel):
    """Guest booking form -- session_id, contact info, party_size,
    attestation, sms_consent, and a honeypot field bots fill but humans
    never see."""

    model_config = {}

    session_id: str
    full_name: str
    email: str
    phone: str | None = None
    party_size: int = 1
    attestation: AttestationInput = AttestationInput()
    sms_consent: bool = False
    honeypot_field: str = ""


class BookingCreateResponse(BaseModel):
    """What the confirm step needs: the booking id + its private manage
    URL, plus the deposit invoice's pay link when the course carries a
    deposit (doc 05: "the confirmation screen embeds that invoice's pay
    flow")."""

    model_config = {}

    booking_id: str
    manage_url: str
    # Both None when the course has no deposit (no invoice was created).
    pay_url: str | None = None
    amount_due: str | None = None


class BookingDetailResponse(BaseModel):
    """The manage-page view of one booking (resolved only via manage token)."""

    model_config = {}

    booking_id: str
    status: str
    party_size: int
    course_title: str
    starts_at: str
    ends_at: str
    location_name: str
    location_addr: str
    can_cancel_online: bool
    # Outstanding balance on the linked invoice + its pay link (both None
    # when there is no linked invoice or nothing is owed). Pay tokens are
    # STABLE, derived values (see domain/invoices/service.py::
    # derive_pay_token), so serving the link on a passive GET is safe: it
    # is the SAME link the invoice email carried, and rendering the manage
    # page never invalidates anything (doc 05: "a booking's manage page
    # links straight to its invoice's pay page when a balance is due").
    pay_url: str | None = None
    amount_due: str | None = None


def _to_input(payload: BookingCreateRequest, session_id: UUID) -> BookingInput:
    return BookingInput(
        session_id=session_id,
        full_name=payload.full_name,
        email=payload.email,
        party_size=payload.party_size,
        attestation_version=payload.attestation.version,
        attestation_accepted=payload.attestation.accepted,
        sms_consent=payload.sms_consent,
        phone=payload.phone or "",
    )


def _parse_session_id(raw: str) -> UUID | None:
    try:
        return UUID(raw)
    except ValueError:
        return None


@router.post("")
async def create_booking_endpoint(
    payload: BookingCreateRequest,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(_rl_create),
) -> dict:
    """POST /api/bookings -- rate-limited 5/hour, honeypot-checked."""
    # HONEYPOT: a filled hidden field means a bot. Return the SAME
    # success-shaped response with NO row created and no email sent --
    # never a 422, which would teach the bot to omit the field. See
    # docs/design/02 and the mission report.
    if payload.honeypot_field:
        logger.info("honeypot triggered on booking create -- silently accepted")
        return {"status": "ok"}

    session_id = _parse_session_id(payload.session_id)
    if session_id is None:
        raise to_http_exception(BookingError.SessionNotFound)
    result = await create_booking(db, _cfg, _to_input(payload, session_id))
    if result.is_err:
        raise to_http_exception(result.danger_err)
    booking, raw_token = result.danger_ok

    # Deposit course -> the confirmation screen embeds the invoice's pay
    # flow (doc 05). The pay link is the invoice's one stable link (see
    # derive_pay_token) -- the same URL the confirmation email carries.
    pay_url: str | None = None
    amount_due_str: str | None = None
    if booking.invoice_id is not None:
        from melpino_backend.db.models.invoices import Invoice
        from melpino_backend.domain.invoices import service as invoice_service

        invoice = await db.get(Invoice, booking.invoice_id)
        if invoice is not None:
            amount_due = await invoice_service.get_amount_due(db, invoice)
            pay_url = await invoice_service.pay_link_for_invoice(db, _cfg, invoice)
            amount_due_str = str(amount_due)

    return BookingCreateResponse(
        booking_id=str(booking.id),
        manage_url=manage_url_for(_cfg, raw_token),
        pay_url=pay_url,
        amount_due=amount_due_str,
    ).model_dump()


@router.post("/waitlist")
async def join_waitlist_endpoint(
    payload: BookingCreateRequest,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(_rl_create),
) -> dict:
    """POST /api/bookings/waitlist -- same shape minus payment."""
    # Same honeypot policy as create (identical success-shaped no-op).
    if payload.honeypot_field:
        logger.info("honeypot triggered on waitlist join -- silently accepted")
        return {"status": "ok"}

    session_id = _parse_session_id(payload.session_id)
    if session_id is None:
        raise to_http_exception(BookingError.SessionNotFound)
    result = await join_waitlist(db, _to_input(payload, session_id))
    if result.is_err:
        raise to_http_exception(result.danger_err)
    return {"status": "ok"}


@router.get("/manage/{token}")
async def get_booking_by_token_endpoint(
    token: str,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(_rl_manage),
) -> dict:
    """GET /api/bookings/manage/{token} -- rate-limited 30/hour."""
    result = await get_booking_by_token(db, token)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    booking = result.danger_ok
    session = await db.get(ClassSession, booking.session_id)
    assert session is not None  # FK RESTRICT: a booking's session always exists
    course = await db.get(Course, session.course_id)
    assert course is not None
    now = datetime.now(timezone.utc)
    can_cancel = booking.status == "confirmed" and within_cancellation_window(
        session.starts_at, now, _cfg.booking_cancellation_hours
    )

    # Read-only balance surface. Serving pay_url here is safe precisely
    # because pay tokens are stable derived values, never rotated by a
    # read -- see BookingDetailResponse's own field comment.
    pay_url: str | None = None
    amount_due_str: str | None = None
    if booking.invoice_id is not None:
        from melpino_backend.db.models.invoices import Invoice
        from melpino_backend.domain.invoices import service as invoice_service

        invoice = await db.get(Invoice, booking.invoice_id)
        if invoice is not None and invoice.status in ("sent", "overdue"):
            amount_due = await invoice_service.get_amount_due(db, invoice)
            if amount_due > 0:
                pay_url = await invoice_service.pay_link_for_invoice(
                    db, _cfg, invoice
                )
                amount_due_str = str(amount_due)

    return BookingDetailResponse(
        booking_id=str(booking.id),
        status=booking.status,
        party_size=booking.party_size,
        course_title=course.title,
        starts_at=session.starts_at.isoformat(),
        ends_at=session.ends_at.isoformat(),
        location_name=session.location_name,
        location_addr=session.location_addr,
        can_cancel_online=can_cancel,
        pay_url=pay_url,
        amount_due=amount_due_str,
    ).model_dump()


@router.post("/manage/{token}/cancel")
async def cancel_booking_by_token_endpoint(
    token: str,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(_rl_manage),
) -> dict:
    """POST /api/bookings/manage/{token}/cancel."""
    result = await cancel_booking_by_token(db, _cfg, token)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    return {"status": "cancelled"}


@router.post("/manage/{token}/resend-confirmation")
async def resend_confirmation_endpoint(
    token: str,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(_rl_manage),
) -> dict:
    """POST /api/bookings/manage/{token}/resend-confirmation."""
    result = await resend_confirmation(db, _cfg, token)
    if result.is_err:
        raise to_http_exception(result.danger_err)
    return {"status": "ok"}
