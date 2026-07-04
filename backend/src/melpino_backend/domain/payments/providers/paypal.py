from __future__ import annotations

# PayPal Orders v2 client (optional provider, gracefully 503s when
# unconfigured) -- see docs/design/05-payments-and-invoicing.md ("copy
# logand.app unchanged"). CRIB: logand.app
# backend/src/logand_backend/domain/payments/providers/paypal.py.
from decimal import Decimal
from typing import TYPE_CHECKING

from pydantic import BaseModel
from typani.result import Result

from melpino_backend.errors import PaymentProviderError

if TYPE_CHECKING:
    from melpino_backend.app.config import AppConfig


class PayPalOrder(BaseModel):
    """A created PayPal order and its approval URL."""

    model_config = {"frozen": True}

    order_id: str
    approval_url: str | None


class PayPalCapture(BaseModel):
    """A captured PayPal order's amount/status/reference/capture id."""

    model_config = {"frozen": True}

    order_id: str
    status: str
    captured_amount: Decimal
    captured_currency: str
    reference_id: str | None
    capture_id: str


class PayPalRefund(BaseModel):
    """A PayPal refund's id and status."""

    model_config = {"frozen": True}

    refund_id: str
    status: str


def is_configured(cfg: "AppConfig") -> bool:
    """True once real PayPal API credentials are set."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def create_order(
    cfg: "AppConfig", invoice_id: str, amount: Decimal, currency: str
) -> Result[PayPalOrder, PaymentProviderError]:
    """Creates a PayPal order for an invoice."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def capture_order(
    cfg: "AppConfig", order_id: str, idempotency_key: str | None = None
) -> Result[PayPalCapture, PaymentProviderError]:
    """Captures an approved order; idempotent under retry via PayPal-Request-Id."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def get_order_status(
    cfg: "AppConfig", order_id: str
) -> Result[PayPalCapture, PaymentProviderError]:
    """Polls a pending order's current capture status."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def refund_capture(
    cfg: "AppConfig",
    capture_id: str,
    amount: Decimal,
    currency: str,
    idempotency_key: str | None = None,
) -> Result[PayPalRefund, PaymentProviderError]:
    """Refunds (fully or partially) a completed capture."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def get_refund_status(
    cfg: "AppConfig", refund_id: str
) -> Result[PayPalRefund, PaymentProviderError]:
    """Polls a pending refund's current status (PayPal delivers no webhook
    for refund completion)."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
