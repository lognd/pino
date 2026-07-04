from __future__ import annotations

# Stripe webhooks -- signature auth, CSRF-exempt (see app/app.py). See
# docs/design/05-payments-and-invoicing.md. CRIB: logand.app
# backend/src/logand_backend/api/webhooks.py (idempotent handling under
# at-least-once delivery).
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
    """Verifies the Stripe signature, then handles payment_intent.succeeded/
    charge.refund.updated/charge.dispute.* idempotently."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
