from __future__ import annotations

# A local HTTP double for the slice of PayPal's Orders v2 + OAuth2 API
# this backend calls -- pointing AppConfig.paypal_api_base at this lets
# the real httpx calls in domain/payments/providers/paypal.py run against
# a local process. CRIB: logand.app
# backend/src/logand_backend/testing/fake_paypal.py (structure only).
from fastapi import FastAPI

app = FastAPI(title="fake-paypal (test double, not real PayPal)")

_orders: dict[str, dict] = {}


@app.post("/v1/oauth2/token")
async def issue_token() -> dict:
    """Returns a fake OAuth2 access token."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@app.post("/v2/checkout/orders")
async def create_order() -> dict:
    """Returns a real-shaped PayPal order with an approve link."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@app.post("/v2/checkout/orders/{order_id}/capture")
async def capture_order(order_id: str) -> dict:
    """Returns a real-shaped capture response."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@app.get("/v2/checkout/orders/{order_id}")
async def get_order(order_id: str) -> dict:
    """Returns the order's current status."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@app.post("/v2/payments/captures/{capture_id}/refund")
async def refund_capture(capture_id: str) -> dict:
    """Returns a real-shaped refund response."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@app.get("/v2/payments/refunds/{refund_id}")
async def get_refund(refund_id: str) -> dict:
    """Returns the refund's current status."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
