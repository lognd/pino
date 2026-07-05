from __future__ import annotations

# A local HTTP double for the slice of Stripe's real API this backend
# calls (stripe.PaymentIntent.create/retrieve, stripe.Refund.create) --
# pointing AppConfig.stripe_api_base at this lets the real stripe-python
# client run its real request/response code against a local process
# instead of api.stripe.com. CRIB: logand.app
# backend/src/logand_backend/testing/fake_stripe.py (structure only --
# this is a from-scratch minimal double, not a byte-for-byte copy).
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="fake-stripe (test double, not real Stripe)")

# In-memory only, module-level state for the lifetime of this process --
# reset by restarting the test double process (or by starting a fresh
# one per test session), never persisted.
_intents: dict[str, dict] = {}
_refunds: dict[str, dict] = {}
# idempotency_key -> intent/refund id already created under it, so a
# retried request with the same key returns the original object instead
# of creating a second one (mirrors real Stripe's Idempotency-Key
# semantics).
_idempotency: dict[str, str] = {}


def _intent_object(intent_id: str, amount: int, currency: str, status: str) -> dict:
    return {
        "id": intent_id,
        "object": "payment_intent",
        "amount": amount,
        "currency": currency,
        "status": status,
        "client_secret": f"{intent_id}_secret_{uuid.uuid4().hex[:8]}",
        "latest_charge": f"ch_{uuid.uuid4().hex[:24]}",
    }


@app.post("/v1/payment_intents")
async def create_payment_intent(request: Request) -> dict:
    """Returns a real-shaped PaymentIntent with a client_secret. Accepts
    the same form-encoded body stripe-python sends (amount/currency/
    metadata[...]) and honors an Idempotency-Key header exactly like real
    Stripe -- a retry with the same key returns the original intent
    instead of creating a second one."""
    form = await request.form()
    idempotency_key = request.headers.get("idempotency-key")
    if idempotency_key and idempotency_key in _idempotency:
        return _intents[_idempotency[idempotency_key]]

    intent_id = f"pi_{uuid.uuid4().hex[:24]}"
    amount = int(str(form.get("amount", 0)))
    currency = str(form.get("currency", "usd"))
    intent = _intent_object(
        intent_id, amount, currency, status="requires_payment_method"
    )
    _intents[intent_id] = intent
    if idempotency_key:
        _idempotency[idempotency_key] = intent_id
    return intent


@app.get("/v1/payment_intents/{intent_id}")
async def retrieve_payment_intent(intent_id: str) -> dict | JSONResponse:
    """Echoes back a previously-created intent's status/client_secret."""
    intent = _intents.get(intent_id)
    if intent is None:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "message": "No such payment_intent",
                    "code": "resource_missing",
                }
            },
        )
    return intent


@app.post("/v1/payment_intents/{intent_id}/confirm")
async def confirm_payment_intent(intent_id: str) -> dict | JSONResponse:
    """Test-only helper (not part of the real Stripe API surface the
    backend calls) letting system tests flip a fake intent to
    succeeded/requires a webhook event to be fired separately by the
    test itself -- this double does not deliver webhooks on its own."""
    intent = _intents.get(intent_id)
    if intent is None:
        return JSONResponse(
            status_code=404, content={"error": {"message": "No such payment_intent"}}
        )
    intent["status"] = "succeeded"
    return intent


@app.post("/v1/refunds")
async def create_refund(request: Request) -> dict:
    """Returns a real-shaped Refund object -- mirrors stripe.Refund.create's
    payment_intent/amount form fields and Idempotency-Key semantics."""
    form = await request.form()
    idempotency_key = request.headers.get("idempotency-key")
    if idempotency_key and idempotency_key in _idempotency:
        return _refunds[_idempotency[idempotency_key]]

    refund_id = f"re_{uuid.uuid4().hex[:24]}"
    refund = {
        "id": refund_id,
        "object": "refund",
        "amount": int(str(form.get("amount", 0))),
        "payment_intent": form.get("payment_intent"),
        "status": "succeeded",
        "created": int(time.time()),
    }
    _refunds[refund_id] = refund
    if idempotency_key:
        _idempotency[idempotency_key] = refund_id
    return refund
