from __future__ import annotations

# Guest booking create/lookup/cancel via manage tokens -- see
# docs/design/04-booking-and-scheduling.md's public API surface and
# docs/design/02-auth-and-security.md's rate limits/honeypot. This route's
# POSTs are CSRF-exempt (no session cookie exists for guests at all, see
# app/app.py) and are the highest-abuse surface in this backend.
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


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
    sms_consent: bool = False
    honeypot_field: str = ""


@router.post("")
async def create_booking(payload: BookingCreateRequest) -> dict:
    """POST /api/bookings -- rate-limited 5/hour, honeypot-checked."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.post("/waitlist")
async def join_waitlist(payload: BookingCreateRequest) -> dict:
    """POST /api/bookings/waitlist -- same shape minus payment."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.get("/manage/{token}")
async def get_booking_by_token(token: str) -> dict:
    """GET /api/bookings/manage/{token} -- rate-limited 30/hour."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.post("/manage/{token}/cancel")
async def cancel_booking_by_token(token: str) -> dict:
    """POST /api/bookings/manage/{token}/cancel."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)


@router.post("/manage/{token}/resend-confirmation")
async def resend_confirmation(token: str) -> None:
    """POST /api/bookings/manage/{token}/resend-confirmation."""
    raise NotImplementedError(
        "see docs/design/04-booking-and-scheduling.md"
    )  # TODO(impl)
