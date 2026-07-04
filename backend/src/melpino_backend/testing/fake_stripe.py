from __future__ import annotations

# A local HTTP double for the slice of Stripe's real API this backend
# calls (stripe.PaymentIntent.create/retrieve) -- pointing
# AppConfig.stripe_api_base at this lets the real stripe-python client run
# its real request/response code against a local process instead of
# api.stripe.com. CRIB: logand.app
# backend/src/logand_backend/testing/fake_stripe.py -- NOT copied
# verbatim (that file is ~125 lines of endpoint logic); only the FastAPI
# app skeleton is reproduced here, endpoints stubbed.
from fastapi import FastAPI

app = FastAPI(title="fake-stripe (test double, not real Stripe)")

# In-memory only, module-level state for the lifetime of this process.
_intents: dict[str, dict] = {}


@app.post("/v1/payment_intents")
async def create_payment_intent() -> dict:
    """Returns a real-shaped PaymentIntent with a client_secret."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@app.get("/v1/payment_intents/{intent_id}")
async def retrieve_payment_intent(intent_id: str) -> dict:
    """Echoes back a previously-created intent's status/client_secret."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
