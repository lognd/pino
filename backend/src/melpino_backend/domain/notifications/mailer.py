from __future__ import annotations

# SMTP / Gmail OAuth2 mail transport -- see
# docs/design/04-booking-and-scheduling.md ("copy logand.app's
# notifications stack"). CRIB: logand.app
# backend/src/logand_backend/domain/notifications/mailer.py -- copied
# nearly verbatim (Google retired password/app-password SMTP auth for
# Workspace accounts in March 2025, so a Workspace mailbox must use the
# Gmail REST API's service-account JWT Bearer flow instead of plain SMTP).
# The unsubscribe token is keyed by an opaque UUID (melpino passes the
# student id) rather than logand's user id -- the CAN-SPAM opt-out ledger
# itself (db/models/email_opt_out.py) is enforced by email in notify.py.
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import smtplib
import ssl
import time
from dataclasses import dataclass
from email import policy
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from html import escape as html_escape
from uuid import UUID

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

from melpino_backend.app.config import AppConfig

_GOOGLE_TOKEN_API_BASE = "https://oauth2.googleapis.com"
_GMAIL_API_BASE = "https://gmail.googleapis.com"
_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

logger = logging.getLogger(__name__)


def is_configured(cfg: AppConfig) -> bool:
    """True once plain SMTP or Gmail OAuth2 is configured."""
    return bool(cfg.smtp_host) or _gmail_oauth_configured(cfg)


def _gmail_oauth_configured(cfg: AppConfig) -> bool:
    """Both Gmail fields required together -- a service-account key with no
    mailbox to impersonate (or vice versa) cannot send anything."""
    return bool(cfg.gmail_service_account_json and cfg.gmail_sender_email)


# Coarse expiry window for unsubscribe links -- long enough a recent
# email's footer link never nags a real recipient, short enough a token
# captured from a stale archived thread eventually stops working.
_UNSUBSCRIBE_TOKEN_MAX_AGE_DAYS = 180


def sign_unsubscribe_token(user_id: UUID, cfg: AppConfig) -> str:
    """HMAC-signed, day-granularity, expiring unsubscribe token --
    "{id}.{issued_epoch_day}.{hmac-sha256}", verifiable without a DB
    lookup, reusing session_secret as the HMAC key."""
    user_id_str = str(user_id)
    issued_epoch_day = int(time.time() // 86400)
    payload = f"{user_id_str}.{issued_epoch_day}"
    sig = hmac.new(
        cfg.session_secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256
    ).hexdigest()
    return f"{payload}.{sig}"


def verify_unsubscribe_token(token: str, cfg: AppConfig) -> UUID | None:
    """None for any malformed, tampered, or expired token."""
    try:
        user_id_str, issued_epoch_day_str, sig = token.rsplit(".", 2)
        user_id = UUID(user_id_str)
        issued_epoch_day = int(issued_epoch_day_str)
    except ValueError:
        return None
    payload = f"{user_id_str}.{issued_epoch_day}"
    expected = hmac.new(
        cfg.session_secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    current_epoch_day = int(time.time() // 86400)
    if current_epoch_day - issued_epoch_day > _UNSUBSCRIBE_TOKEN_MAX_AGE_DAYS:
        return None
    return user_id


def _footer_html(cfg: AppConfig, unsubscribe_url: str) -> str:
    business = html_escape(cfg.business_legal_name)
    address = f", {html_escape(cfg.mailing_address)}" if cfg.mailing_address else ""
    return (
        f'<p style="margin:0 0 6px;">{business}{address}</p>'
        f'<p style="margin:0;">'
        f'<a href="{html_escape(unsubscribe_url, quote=True)}" '
        f'style="color:inherit;">Unsubscribe</a>'
        " from these emails.</p>"
    )


def _footer_text(cfg: AppConfig, unsubscribe_url: str) -> str:
    address = f", {cfg.mailing_address}" if cfg.mailing_address else ""
    return (
        f"\n\n--\n{cfg.business_legal_name}{address}\n"
        f"Unsubscribe from these emails: {unsubscribe_url}\n"
    )


# Gruvbox terminal-window chrome (mirrors the site's own aesthetic), set
# twice: inline (every client) + a dark-mode media query with !important
# (the only way to override an inline style from a stylesheet). Standard
# email-HTML compatibility practice, not a specificity hack.
_LIGHT = {
    "page_bg": "#d5c4a1",
    "card_bg": "#fbf1c7",
    "titlebar_bg": "#ebdbb2",
    "fg": "#282828",
    "muted": "#665c54",
    "border": "#bdae93",
    "accent_green": "#66800b",
}
_DARK = {
    "page_bg": "#1d2021",
    "card_bg": "#282828",
    "titlebar_bg": "#3c3836",
    "fg": "#ebdbb2",
    "muted": "#a89984",
    "border": "#504945",
    "accent_green": "#b8bb26",
}
_MONO_STACK = (
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
)
_TITLE_MAX_LEN = 46


def _window_title(subject: str) -> str:
    """Truncates the in-body titlebar decoration; the real Subject header
    is still the full untruncated text."""
    if len(subject) <= _TITLE_MAX_LEN:
        return subject
    return subject[: _TITLE_MAX_LEN - 3] + "..."


def _wrap_terminal_shell(*, subject: str, content_html: str, footer_html: str) -> str:
    """Wraps message-specific content in the light/dark terminal-window
    card. Table-based layout throughout (Outlook's Word engine has no
    flexbox/grid); color set twice (inline default + dark-mode media
    query) -- standard email-HTML practice."""
    title = html_escape(_window_title(subject))
    table_open = '<table role="presentation" width="100%" cellpadding="0" '
    table_open += 'cellspacing="0" border="0">'
    dot = '<span class="ln-dot" style="color:{muted}; margin-left:10px;">{glyph}</span>'
    dots = "".join(
        dot.format(muted=_LIGHT["muted"], glyph=glyph)
        for glyph in ("&#8722;", "&#9633;", "&#215;")
    )
    lines = [
        "<!doctype html>",
        "<html>",
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="light dark">',
        '<meta name="supported-color-schemes" content="light dark">',
        "<style>",
        "@media (prefers-color-scheme: dark) {",
        f"  .ln-page {{ background-color: {_DARK['page_bg']} !important; }}",
        f"  .ln-card {{ background-color: {_DARK['card_bg']} !important;",
        f"    border-color: {_DARK['border']} !important; }}",
        f"  .ln-titlebar {{ background-color: {_DARK['titlebar_bg']} !important;",
        f"    border-color: {_DARK['border']} !important; }}",
        f"  .ln-titlebar *, .ln-dot {{ color: {_DARK['muted']} !important; }}",
        f"  .ln-text {{ color: {_DARK['fg']} !important;",
        f"    background-color: {_DARK['card_bg']} !important; }}",
        f"  .ln-muted {{ color: {_DARK['muted']} !important; }}",
        f"  .ln-footer {{ background-color: {_DARK['page_bg']} !important; }}",
        f"  .ln-cta {{ color: {_DARK['accent_green']} !important; }}",
        "}",
        "</style>",
        "</head>",
        f'<body class="ln-page" style="margin:0; padding:24px 12px; '
        f'background-color:{_LIGHT["page_bg"]};">',
        table_open,
        '<tr><td align="center">',
        '<table role="presentation" width="600" cellpadding="0" '
        'cellspacing="0" border="0" style="max-width:600px; width:100%;">',
        f'<tr><td class="ln-card" bgcolor="{_LIGHT["card_bg"]}" '
        f'style="background-color:{_LIGHT["card_bg"]}; '
        f'border:1px solid {_LIGHT["border"]}; border-radius:6px;">',
        table_open,
        f'<tr><td class="ln-titlebar" bgcolor="{_LIGHT["titlebar_bg"]}" '
        f'style="background-color:{_LIGHT["titlebar_bg"]}; '
        f"border-bottom:1px solid {_LIGHT['border']}; "
        f'border-radius:6px 6px 0 0; padding:10px 16px;">',
        table_open,
        "<tr>",
        f'<td style="font-family:{_MONO_STACK}; '
        f'font-size:12px; color:{_LIGHT["muted"]};">{title}</td>',
        f'<td align="right" style="white-space:nowrap; '
        f'font-family:{_MONO_STACK}; font-size:13px; color:{_LIGHT["muted"]};">'
        f"{dots}</td>",
        "</tr>",
        "</table>",
        "</td></tr>",
        f'<tr><td class="ln-text" bgcolor="{_LIGHT["card_bg"]}" '
        f'style="background-color:{_LIGHT["card_bg"]}; padding:24px 20px;">',
        f'<div style="font-family:{_MONO_STACK}; '
        f'font-size:14px; line-height:1.6; color:{_LIGHT["fg"]};">',
        content_html,
        "</div>",
        "</td></tr>",
        "</table>",
        "</td></tr>",
        f'<tr><td class="ln-footer" bgcolor="{_LIGHT["page_bg"]}" '
        f'style="background-color:{_LIGHT["page_bg"]}; padding:16px 8px 0;">',
        f'<div class="ln-muted" style="font-family:{_MONO_STACK}; '
        f'font-size:11px; line-height:1.6; color:{_LIGHT["muted"]};">',
        footer_html,
        "</div>",
        "</td></tr>",
        "</table>",
        "</td></tr>",
        "</table>",
        "</body>",
        "</html>",
    ]
    return "\n".join(lines)


@dataclass(frozen=True)
class EmailAttachment:
    """A real MIME attachment -- filename, bytes, and split maintype/subtype."""

    filename: str
    content: bytes
    maintype: str
    subtype: str


def build_message(
    cfg: AppConfig,
    *,
    to_email: str,
    to_user_id: UUID,
    subject: str,
    content_html: str,
    content_text: str,
    attachments: tuple[EmailAttachment, ...] = (),
) -> EmailMessage:
    """Builds a real multipart/alternative MIME message with CAN-SPAM
    footer + RFC 8058 one-click unsubscribe headers."""
    token = sign_unsubscribe_token(to_user_id, cfg)
    unsubscribe_url = f"{cfg.public_base_url}/api/unsubscribe?token={token}"

    # max_line_length=998 (RFC 5322 hard limit) -- the default 78-col
    # header folding would break the bare List-Unsubscribe URL.
    msg = EmailMessage(policy=policy.default.clone(max_line_length=998))
    msg["Subject"] = subject
    msg["From"] = (
        cfg.gmail_sender_email
        if _gmail_oauth_configured(cfg)
        else cfg.smtp_from_address
    )
    msg["To"] = to_email
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    msg.set_content(content_text + _footer_text(cfg, unsubscribe_url))
    msg.add_alternative(
        _wrap_terminal_shell(
            subject=subject,
            content_html=content_html,
            footer_html=_footer_html(cfg, unsubscribe_url),
        ),
        subtype="html",
    )
    for attachment in attachments:
        msg.add_attachment(
            attachment.content,
            maintype=attachment.maintype,
            subtype=attachment.subtype,
            filename=attachment.filename,
        )
    return msg


def _send_sync(cfg: AppConfig, msg: EmailMessage) -> None:
    assert cfg.smtp_host is not None
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=10) as client:
        if cfg.smtp_use_tls:
            client.starttls(context=ssl.create_default_context())
        if cfg.smtp_username and cfg.smtp_password:
            client.login(cfg.smtp_username, cfg.smtp_password)
        client.send_message(msg)


def _b64url(data: bytes) -> bytes:
    """Base64url WITHOUT padding -- required by both JWT (RFC 7519) and the
    Gmail API's `raw` field."""
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def _build_signed_jwt(
    service_account_info: dict, *, sender_email: str, scope: str, audience: str
) -> str:
    """Hand-rolled RS256 JWT Bearer assertion (RFC 7523) for a Google
    service account -- "sub" is what makes this domain-wide delegation."""
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": service_account_info["client_email"],
        "scope": scope,
        "aud": audience,
        "iat": now,
        "exp": now + 3600,
        "sub": sender_email,
    }
    signing_input = (
        _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        + b"."
        + _b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    )
    private_key = serialization.load_pem_private_key(
        service_account_info["private_key"].encode("utf-8"), password=None
    )
    assert isinstance(private_key, RSAPrivateKey)
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return (signing_input + b"." + _b64url(signature)).decode("ascii")


# Process-local Gmail access-token cache, keyed by identity so a config
# change can't reuse a stale token minted for a different mailbox.
_gmail_token_cache: dict[tuple[str, str, str], tuple[str, float]] = {}
_GMAIL_TOKEN_REFRESH_SKEW = 60.0


def _gmail_cache_key(cfg: AppConfig) -> tuple[str, str, str]:
    """Cache key for the current Gmail service-account identity."""
    assert cfg.gmail_service_account_json is not None
    assert cfg.gmail_sender_email is not None
    info = json.loads(cfg.gmail_service_account_json)
    token_url = f"{cfg.gmail_token_api_base or _GOOGLE_TOKEN_API_BASE}/token"
    return (info["client_email"], cfg.gmail_sender_email, token_url)


async def _get_gmail_access_token(
    cfg: AppConfig, client: httpx.AsyncClient, *, force_refresh: bool = False
) -> str:
    """Exchanges a JWT Bearer assertion for a short-lived access token,
    reusing a cached token for its remaining lifetime. `force_refresh`
    skips the cache after a 401."""
    assert cfg.gmail_service_account_json is not None
    assert cfg.gmail_sender_email is not None
    info = json.loads(cfg.gmail_service_account_json)
    token_url = f"{cfg.gmail_token_api_base or _GOOGLE_TOKEN_API_BASE}/token"
    cache_key = (info["client_email"], cfg.gmail_sender_email, token_url)

    if not force_refresh:
        cached = _gmail_token_cache.get(cache_key)
        if cached is not None:
            token, expires_at = cached
            if time.monotonic() < expires_at:
                return token

    assertion = _build_signed_jwt(
        info,
        sender_email=cfg.gmail_sender_email,
        scope=_GMAIL_SEND_SCOPE,
        audience=token_url,
    )
    resp = await client.post(
        token_url,
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        },
    )
    resp.raise_for_status()
    body = resp.json()
    token = body["access_token"]
    expires_in = float(body.get("expires_in", 3600))
    _gmail_token_cache[cache_key] = (
        token,
        time.monotonic() + max(expires_in - _GMAIL_TOKEN_REFRESH_SKEW, 0.0),
    )
    return token


async def _send_via_gmail_api(cfg: AppConfig, msg: EmailMessage) -> None:
    """Sends through the Gmail REST API (users.messages.send) -- OAuth2 is
    the only way left to send as a Workspace mailbox (Google retired
    SMTP password auth in March 2025)."""
    raw = _b64url(msg.as_bytes()).decode("ascii")
    api_base = cfg.gmail_api_base or _GMAIL_API_BASE
    async with httpx.AsyncClient(timeout=10.0) as client:
        token = await _get_gmail_access_token(cfg, client)
        resp = await client.post(
            f"{api_base}/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"raw": raw},
        )
        if resp.status_code == 401:
            logger.warning(
                "gmail_api_401_evicting_cached_token",
                extra={"cache_key": _gmail_cache_key(cfg)[:2]},
            )
            _gmail_token_cache.pop(_gmail_cache_key(cfg), None)
            token = await _get_gmail_access_token(cfg, client, force_refresh=True)
            resp = await client.post(
                f"{api_base}/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {token}"},
                json={"raw": raw},
            )
        resp.raise_for_status()


async def send_email(
    cfg: AppConfig,
    *,
    to_email: str,
    to_user_id: UUID,
    subject: str,
    content_html: str,
    content_text: str,
    attachments: tuple[EmailAttachment, ...] = (),
) -> None:
    """Sends via Gmail OAuth2 (if configured) else plain SMTP. Caller must
    check is_configured(cfg) first."""
    msg = build_message(
        cfg,
        to_email=to_email,
        to_user_id=to_user_id,
        subject=subject,
        content_html=content_html,
        content_text=content_text,
        attachments=attachments,
    )
    if _gmail_oauth_configured(cfg):
        await _send_via_gmail_api(cfg, msg)
    else:
        await asyncio.to_thread(_send_sync, cfg, msg)
