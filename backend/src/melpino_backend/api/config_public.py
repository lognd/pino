from __future__ import annotations

# GET /api/config -- brand identity + available payment methods, for
# the frontend's brand.ts and Pay page. See
# docs/design/00-overview.md's business-identity rule and
# docs/design/05-payments-and-invoicing.md's payment-methods endpoint.
from fastapi import APIRouter

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
async def get_public_config() -> dict:
    """Returns business_legal_name/business_short_name + which payment
    methods (stripe/paypal/zelle) are currently configured."""
    raise NotImplementedError("see docs/design/00-overview.md")  # TODO(impl)
