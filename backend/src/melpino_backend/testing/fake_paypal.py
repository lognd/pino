from __future__ import annotations

# A local HTTP double for the slice of PayPal's Orders v2 + OAuth2 API
# this backend calls -- pointing AppConfig.paypal_api_base at this lets
# the real httpx calls in domain/payments/providers/paypal.py run against
# a local process. CRIB: logand.app
# backend/src/logand_backend/testing/fake_paypal.py (structure only --
# from-scratch minimal double, not a byte-for-byte copy).
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="fake-paypal (test double, not real PayPal)")

# order_id -> order body (in PayPal's own v2/checkout/orders shape).
_orders: dict[str, dict] = {}
# capture_id -> refund records issued against it.
_refunds: dict[str, dict] = {}
# idempotency key -> the previously-returned order/refund body.
_idempotency: dict[str, dict] = {}


@app.post("/v1/oauth2/token")
async def issue_token() -> dict:
    """Returns a fake OAuth2 access token -- this double does not
    validate the basic-auth client_id/secret at all (there is nothing
    real behind them in a test run)."""
    token = f"fake-access-token-{uuid.uuid4().hex[:12]}"
    return {"access_token": token, "expires_in": 3600}


def _order_body(
    order_id: str, amount: str, currency: str, reference_id: str, status: str
) -> dict:
    body = {
        "id": order_id,
        "status": status,
        "links": [
            {"rel": "approve", "href": f"https://fake-paypal.test/approve/{order_id}"}
        ],
        "purchase_units": [
            {
                "reference_id": reference_id,
                "amount": {"currency_code": currency, "value": amount},
            }
        ],
    }
    return body


@app.post("/v2/checkout/orders")
async def create_order(request: Request) -> dict:
    """Returns a real-shaped PayPal order with an approve link."""
    payload = await request.json()
    unit = payload["purchase_units"][0]
    order_id = f"ORDER-{uuid.uuid4().hex[:16].upper()}"
    order = _order_body(
        order_id,
        unit["amount"]["value"],
        unit["amount"]["currency_code"],
        unit.get("reference_id", ""),
        status="CREATED",
    )
    _orders[order_id] = order
    return order


def _idempotency_key(request: Request) -> str | None:
    return request.headers.get("paypal-request-id")


@app.post("/v2/checkout/orders/{order_id}/capture")
async def capture_order(order_id: str, request: Request) -> JSONResponse | dict:
    """Returns a real-shaped capture response -- honors PayPal-Request-Id
    idempotency and returns ORDER_ALREADY_CAPTURED (422) on a second
    capture attempt with a DIFFERENT/no key, matching real PayPal's
    behavior that domain/payments/providers/paypal.py::capture_order
    specifically handles."""
    order = _orders.get(order_id)
    if order is None:
        return JSONResponse(status_code=404, content={"message": "order not found"})

    idem_key = _idempotency_key(request)
    if idem_key and idem_key in _idempotency:
        return _idempotency[idem_key]

    if order["status"] == "COMPLETED":
        return JSONResponse(
            status_code=422,
            content={"details": [{"issue": "ORDER_ALREADY_CAPTURED"}]},
        )

    capture_id = f"CAPTURE-{uuid.uuid4().hex[:16].upper()}"
    unit = order["purchase_units"][0]
    order["status"] = "COMPLETED"
    unit["payments"] = {
        "captures": [
            {
                "id": capture_id,
                "status": "COMPLETED",
                "amount": unit["amount"],
            }
        ]
    }
    if idem_key:
        _idempotency[idem_key] = order
    return order


@app.get("/v2/checkout/orders/{order_id}")
async def get_order(order_id: str) -> JSONResponse | dict:
    """Returns the order's current status."""
    order = _orders.get(order_id)
    if order is None:
        return JSONResponse(status_code=404, content={"message": "order not found"})
    return order


@app.post("/v2/payments/captures/{capture_id}/refund")
async def refund_capture(capture_id: str, request: Request) -> dict:
    """Returns a real-shaped refund response."""
    payload = await request.json()
    idem_key = _idempotency_key(request)
    if idem_key and idem_key in _idempotency:
        return _idempotency[idem_key]

    refund_id = f"REFUND-{uuid.uuid4().hex[:16].upper()}"
    refund = {
        "id": refund_id,
        "status": "COMPLETED",
        "amount": payload.get("amount"),
    }
    _refunds[refund_id] = refund
    if idem_key:
        _idempotency[idem_key] = refund
    return refund


@app.get("/v2/payments/refunds/{refund_id}")
async def get_refund(refund_id: str) -> JSONResponse | dict:
    """Returns the refund's current status."""
    refund = _refunds.get(refund_id)
    if refund is None:
        return JSONResponse(status_code=404, content={"message": "refund not found"})
    return refund
