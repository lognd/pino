from __future__ import annotations

# GET /api/config -- brand identity + available payment methods, for
# the frontend's brand.ts and Pay page. See
# docs/design/00-overview.md's business-identity rule and
# docs/design/05-payments-and-invoicing.md's payment-methods endpoint.
import argparse

from fastapi import APIRouter
from pydantic import BaseModel

from melpino_backend.app.config import AppConfig

router = APIRouter(prefix="/api/config", tags=["config"])


class PaymentMethods(BaseModel):
    """Which payment surfaces are currently configured -- the frontend
    hides a method entirely rather than showing a disabled button when
    its backing config is unset (docs/design/05)."""

    model_config = {}

    stripe: bool
    paypal: bool
    zelle_handle: str | None


class PublicConfigResponse(BaseModel):
    """Public-safe brand + payment-method availability, sourced entirely
    from AppConfig -- no secrets, no DB hit needed."""

    model_config = {}

    business_legal_name: str
    business_short_name: str
    payment_methods: PaymentMethods


def _build_response(cfg: AppConfig) -> PublicConfigResponse:
    """Pure builder (no I/O) so tests can pass an arbitrary AppConfig
    without needing a running app."""
    return PublicConfigResponse(
        business_legal_name=cfg.business_legal_name,
        business_short_name=cfg.business_short_name,
        payment_methods=PaymentMethods(
            # "configured" per AppConfig's own None-means-unconfigured
            # convention (see config.py's doc comments on
            # payment_processor_secret/paypal_client_id/zelle_handle).
            stripe=bool(cfg.payment_processor_secret),
            paypal=bool(cfg.paypal_client_id and cfg.paypal_client_secret),
            zelle_handle=cfg.zelle_handle,
        ),
    )


@router.get("")
async def get_public_config() -> PublicConfigResponse:
    """Returns business_legal_name/business_short_name + which payment
    methods (stripe/paypal/zelle) are currently configured. Builds a
    fresh AppConfig per request (not a module-level singleton) so tests
    that monkeypatch env vars at request time are honored, same pattern
    as logand.app's api/invoices.py routes."""
    cfg = AppConfig.from_external(argparse.Namespace())
    return _build_response(cfg)
