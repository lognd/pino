from __future__ import annotations

# AppConfig -- env/CLI-driven settings for the whole backend. CRIB:
# logand.app backend/src/logand_backend/app/config.py -- field list and
# from_external pattern copied, with the deltas docs/design/01 requires
# (business_legal_name/business_short_name, public_base_url default,
# booking_cancellation_hours, reminder_days_before, zelle_handle, and
# invoice "business name" now derived from business_legal_name instead of
# a redundant invoice_business_name field).
import argparse
import os
from typing import Self

from dotenv import load_dotenv
from pydantic import BaseModel


class AppConfig(BaseModel):
    model_config = {}

    database_url: str = "postgresql+asyncpg://melpino:changeme@localhost:5432/melpino"
    # None (not a plausible-looking "redis://localhost:6379/0" default) --
    # auth/rate_limit.py's RateLimiter treats redis_url=None as "use the
    # in-process fallback." A plausible-looking default here would make
    # every environment without a real Redis reachable at that exact
    # address look "configured" while actually being unreachable. CRIB:
    # logand.app app/config.py's identical field + comment.
    redis_url: str | None = None
    session_secret: str = "dev-only-insecure-secret"
    # None means "not configured" -- matching paypal_client_id/secret's
    # own None-means-unconfigured convention. A plausible-looking
    # "sk_test_fake" default here previously made GET /api/config report
    # stripe:true even when Stripe was never actually set up (flagged
    # during P2; fixed in P4 -- see docs/design/05). Tests that need
    # Stripe to appear configured must set this explicitly, e.g. via
    # app_config fixture overrides or PAYMENT_PROCESSOR_SECRET.
    payment_processor_secret: str | None = None
    stripe_webhook_secret: str = "whsec_fake"
    # None means "talk to the real api.stripe.com" -- only ever set to
    # something else in test/CI, pointing at testing/fake_stripe.py.
    stripe_api_base: str | None = None
    # PayPal is optional -- None means "not configured," a real, expected
    # state (domain/payments/providers/paypal.py::is_configured).
    paypal_client_id: str | None = None
    paypal_client_secret: str | None = None
    paypal_mode: str = "sandbox"
    paypal_api_base: str | None = None
    # Both must be explicitly set for the admin seed to run at all -- see
    # app/app.py's lifespan.
    seed_admin_email: str | None = None
    seed_admin_password: str | None = None
    # Domain undecided (docs/design/00-overview.md's open question) --
    # used to build absolute links in generated invoice PDFs and email
    # CTAs, which have no browser origin of their own to resolve a
    # relative path against.
    public_base_url: str = "https://SITE-DOMAIN-TBD"
    # Public brand identity -- lives in EXACTLY these two fields per
    # docs/design/00-overview.md's "bulletproof rule" (plus
    # frontend/src/lib/brand.ts on the frontend side). Every invoice/
    # email/PDF interpolates from these, never a hardcoded "Mel Pino".
    business_legal_name: str = "Mel Pino, LLC"
    business_short_name: str = "Mel Pino"
    # Free-form -- address/tax ID/phone, whatever the invoice letterhead
    # should show under the business name. Empty by default, never a
    # placeholder that could be mistaken for real business info.
    invoice_business_details: str = ""
    invoice_contact_email: str = "billing@SITE-DOMAIN-TBD"
    # None means "not configured yet" -- the booking/invoice pay page only
    # shows Zelle as an option once this is actually set. Free-form (a
    # phone number or email), not validated as either shape.
    zelle_handle: str | None = None
    # Guest cancellation window (docs/design/04) -- hours before a
    # session's starts_at after which a guest cancel 409s with
    # CancellationWindowClosed and the UI says "call us".
    booking_cancellation_hours: int = 24
    # Reminder-email lead time (docs/design/04) -- scripts/scheduler.py's
    # daily sweep sends a `reminder` email this many days before a
    # session's starts_at, idempotent via the reminders_sent ledger.
    reminder_days_before: int = 2
    # SMTP is optional -- None means domain/notifications/mailer.py's
    # is_configured() is False and every notification becomes a silent
    # no-op. Nothing in the booking/payment flow depends on email being
    # deliverable.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_from_address: str = "noreply@SITE-DOMAIN-TBD"
    # Gmail OAuth2 alternate transport -- see mailer.py's CRIB pointer for
    # why plain SMTP alone isn't enough for a Workspace mailbox. Mutually
    # exclusive with SMTP_* in practice; Gmail OAuth2 takes precedence if
    # both are set.
    gmail_service_account_json: str | None = None
    gmail_sender_email: str | None = None
    gmail_token_api_base: str | None = None
    gmail_api_base: str | None = None
    # CAN-SPAM requires a valid physical postal address in every
    # commercial email's footer -- deliberately empty by default.
    mailing_address: str = ""
    # "local" (default, zero-config) or "r2" -- see domain/storage/factory.py.
    storage_backend: str = "local"
    storage_local_dir: str = "./data/storage"
    r2_bucket: str | None = None
    r2_endpoint_url: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    # None means "no public URL" -- waiver scans (PII-dense, see
    # docs/design/02) are never given a public URL regardless of this
    # setting; course PDFs may opt into it later.
    r2_public_base_url: str | None = None
    # Long random secret gating the subscribable ICS calendar feed
    # (/api/calendar/feed.ics?key=...). Calendar apps cannot send admin
    # session cookies, so the key IS the auth -- unset disables the feed.
    calendar_feed_key: str | None = None
    host: str = "127.0.0.1"
    port: int = 8000

    @classmethod
    def from_external(cls, args: argparse.Namespace) -> Self:
        # NOTE: load_dotenv() reads .env into os.environ for us -- we never
        # open or print .env ourselves, only read already-loaded env vars.
        load_dotenv()
        merged: dict[str, object] = {}
        merged.update(cls._env_overrides())
        merged.update(cls._args_to_dict(args))
        # model_validate (not cls(**merged)) because merged is a
        # dynamically built dict[str, object].
        return cls.model_validate(merged)

    @staticmethod
    def _env_overrides() -> dict[str, object]:
        env_map = {
            "DATABASE_URL": "database_url",
            "REDIS_URL": "redis_url",
            "SESSION_SECRET": "session_secret",
            "PAYMENT_PROCESSOR_SECRET": "payment_processor_secret",
            "STRIPE_WEBHOOK_SECRET": "stripe_webhook_secret",
            "STRIPE_API_BASE": "stripe_api_base",
            "PAYPAL_CLIENT_ID": "paypal_client_id",
            "PAYPAL_CLIENT_SECRET": "paypal_client_secret",
            "PAYPAL_MODE": "paypal_mode",
            "PAYPAL_API_BASE": "paypal_api_base",
            "SEED_ADMIN_EMAIL": "seed_admin_email",
            "SEED_ADMIN_PASSWORD": "seed_admin_password",
            "PUBLIC_BASE_URL": "public_base_url",
            "BUSINESS_LEGAL_NAME": "business_legal_name",
            "BUSINESS_SHORT_NAME": "business_short_name",
            "INVOICE_BUSINESS_DETAILS": "invoice_business_details",
            "INVOICE_CONTACT_EMAIL": "invoice_contact_email",
            "ZELLE_HANDLE": "zelle_handle",
            "CALENDAR_FEED_KEY": "calendar_feed_key",
            "BOOKING_CANCELLATION_HOURS": "booking_cancellation_hours",
            "REMINDER_DAYS_BEFORE": "reminder_days_before",
            "SMTP_HOST": "smtp_host",
            "SMTP_PORT": "smtp_port",
            "SMTP_USERNAME": "smtp_username",
            "SMTP_PASSWORD": "smtp_password",
            "SMTP_USE_TLS": "smtp_use_tls",
            "SMTP_FROM_ADDRESS": "smtp_from_address",
            "GMAIL_SERVICE_ACCOUNT_JSON": "gmail_service_account_json",
            "GMAIL_SENDER_EMAIL": "gmail_sender_email",
            "GMAIL_TOKEN_API_BASE": "gmail_token_api_base",
            "GMAIL_API_BASE": "gmail_api_base",
            "MAILING_ADDRESS": "mailing_address",
            "STORAGE_BACKEND": "storage_backend",
            "STORAGE_LOCAL_DIR": "storage_local_dir",
            "R2_BUCKET": "r2_bucket",
            "R2_ENDPOINT_URL": "r2_endpoint_url",
            "R2_ACCESS_KEY_ID": "r2_access_key_id",
            "R2_SECRET_ACCESS_KEY": "r2_secret_access_key",
            "R2_PUBLIC_BASE_URL": "r2_public_base_url",
            "HOST": "host",
            "PORT": "port",
        }
        out: dict[str, object] = {}
        for env_key, field in env_map.items():
            value = os.environ.get(env_key)
            if value is not None:
                out[field] = value
        return out

    @staticmethod
    def _args_to_dict(args: argparse.Namespace) -> dict[str, object]:
        return {k: v for k, v in vars(args).items() if v is not None}

    @property
    def invoice_business_name(self) -> str:
        """The name shown on invoice letterhead -- derived from
        business_legal_name, not a second independently-configured field
        (docs/design/01: "do not keep two names for the same
        business")."""
        return self.business_legal_name
