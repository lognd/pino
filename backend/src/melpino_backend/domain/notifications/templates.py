from __future__ import annotations

# Message-specific email content builders -- mailer.build_message wraps
# these in the shared terminal-window shell + CAN-SPAM footer. See
# docs/design/04-booking-and-scheduling.md's confirmation/reminder/
# cancellation/waitlist-offer emails and docs/design/05's invoice/payment
# emails. CRIB: logand.app
# backend/src/logand_backend/domain/notifications/templates.py.
from decimal import Decimal
from html import escape as html_escape
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from melpino_backend.app.config import AppConfig

# Inline accent-green so the CTA reads correctly in a client that ignores
# the shell's class-based dark-mode overrides (matches mailer._LIGHT).
_CTA_COLOR = "#66800b"
_MUTED_COLOR = "#665c54"


def _cta(url: str, label: str) -> str:
    """A `$ <command>`-styled call-to-action link matching the site's own
    terminal aesthetic."""
    return (
        f'<a href="{html_escape(url, quote=True)}" class="ln-cta" '
        f'style="color:{_CTA_COLOR}; text-decoration:none; font-weight:600;">'
        f"$ {html_escape(label)}</a>"
    )


def booking_confirmed(
    cfg: "AppConfig", *, booking_id: UUID, manage_url: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a new confirmed booking."""
    business = html_escape(cfg.business_short_name)
    subject = f"Your booking with {cfg.business_short_name} is confirmed"
    html = (
        f'<p style="margin:0 0 12px;">Your class booking with {business} is '
        "confirmed. We look forward to seeing you.</p>"
        f'<p class="ln-muted" style="margin:0 0 16px; font-size:12px; '
        f'color:{_MUTED_COLOR};">Booking reference: {booking_id}</p>'
        f'<p style="margin:0 0 12px;">{_cta(manage_url, "manage-booking")}</p>'
        '<p class="ln-muted" style="margin:0; font-size:12px; '
        f'color:{_MUTED_COLOR};">Use the link above to view details or cancel. '
        "Keep this email -- it is the only copy of your private link.</p>"
    )
    text = (
        f"Your class booking with {cfg.business_short_name} is confirmed. "
        "We look forward to seeing you.\n\n"
        f"Booking reference: {booking_id}\n\n"
        f"View or manage your booking: {manage_url}\n\n"
        "Keep this email -- it is the only copy of your private link.\n"
    )
    return subject, html, text


def booking_cancelled(cfg: "AppConfig", *, booking_id: UUID) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a cancelled booking."""
    business = html_escape(cfg.business_short_name)
    subject = f"Your booking with {cfg.business_short_name} was cancelled"
    html = (
        f'<p style="margin:0 0 12px;">Your class booking with {business} has '
        "been cancelled. If this was not you, please call us.</p>"
        f'<p class="ln-muted" style="margin:0; font-size:12px; '
        f'color:{_MUTED_COLOR};">Booking reference: {booking_id}</p>'
    )
    text = (
        f"Your class booking with {cfg.business_short_name} has been "
        "cancelled. If this was not you, please call us.\n\n"
        f"Booking reference: {booking_id}\n"
    )
    return subject, html, text


def waitlist_offer(
    cfg: "AppConfig", *, session_title: str, manage_url: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a freed-seat waitlist offer."""
    title = html_escape(session_title)
    subject = f"A seat just opened up -- {session_title}"
    html = (
        f'<p style="margin:0 0 12px;">Good news -- a seat just opened up for '
        f"<strong>{title}</strong>. Seats are first-come, first-served, so "
        "book now to claim it.</p>"
        f'<p style="margin:0;">{_cta(manage_url, "book-now")}</p>'
    )
    text = (
        f"Good news -- a seat just opened up for {session_title}. Seats are "
        "first-come, first-served, so book now to claim it.\n\n"
        f"Book now: {manage_url}\n"
    )
    return subject, html, text


def booking_reminder(
    cfg: "AppConfig", *, session_title: str, starts_at: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for the pre-class reminder."""
    title = html_escape(session_title)
    when = html_escape(starts_at)
    subject = f"Reminder: {session_title} is coming up"
    html = (
        f'<p style="margin:0 0 12px;">This is a reminder that your class '
        f"<strong>{title}</strong> starts {when}.</p>"
        '<p class="ln-muted" style="margin:0; font-size:12px; '
        f'color:{_MUTED_COLOR};">If you can no longer attend, please let us '
        "know as soon as possible.</p>"
    )
    text = (
        f"This is a reminder that your class {session_title} starts {starts_at}.\n\n"
        "If you can no longer attend, please let us know as soon as possible.\n"
    )
    return subject, html, text


def invoice_sent(
    cfg: "AppConfig",
    *,
    invoice_id: UUID,
    amount_total: Decimal,
    currency: str,
    due_date: str | None,
    pay_url: str | None = None,
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a new invoice."""
    business = html_escape(cfg.business_short_name)
    amount_str = html_escape(f"{amount_total} {currency.upper()}")
    subject = f"Invoice from {cfg.business_short_name}"
    due_html = (
        f'<p class="ln-muted" style="margin:0 0 12px; font-size:12px; '
        f'color:{_MUTED_COLOR};">Due: {html_escape(due_date)}</p>'
        if due_date
        else ""
    )
    due_text = f"Due: {due_date}\n" if due_date else ""
    cta_html = (
        f'<p style="margin:0 0 12px;">{_cta(pay_url, "pay-invoice")}</p>'
        if pay_url
        else ""
    )
    cta_text = f"Pay online: {pay_url}\n\n" if pay_url else ""
    html = (
        f'<p style="margin:0 0 12px;">{business} has sent you an invoice for '
        f"<strong>{amount_str}</strong>.</p>"
        f"{due_html}{cta_html}"
        f'<p class="ln-muted" style="margin:0; font-size:12px; '
        f'color:{_MUTED_COLOR};">Invoice reference: {invoice_id}</p>'
    )
    text = (
        f"{cfg.business_short_name} has sent you an invoice for {amount_str}.\n\n"
        f"{due_text}{cta_text}"
        f"Invoice reference: {invoice_id}\n"
    )
    return subject, html, text


def payment_received(
    cfg: "AppConfig", *, invoice_id: UUID, amount: Decimal, currency: str
) -> tuple[str, str, str]:
    """Returns (subject, content_html, content_text) for a settled payment."""
    amount_str = html_escape(f"{amount} {currency.upper()}")
    subject = f"Payment received -- {cfg.business_short_name}"
    html = (
        f'<p style="margin:0 0 12px;">Thank you -- we have received your '
        f"payment of <strong>{amount_str}</strong>.</p>"
        f'<p class="ln-muted" style="margin:0; font-size:12px; '
        f'color:{_MUTED_COLOR};">Invoice reference: {invoice_id}</p>'
    )
    text = (
        f"Thank you -- we have received your payment of {amount_str}.\n\n"
        f"Invoice reference: {invoice_id}\n"
    )
    return subject, html, text
