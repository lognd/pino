from __future__ import annotations

# Integration coverage for Stripe/PayPal/manual payments and refunds --
# see docs/design/05-payments-and-invoicing.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_stripe_webhook_is_idempotent_under_at_least_once_delivery() -> None:
    """The same Stripe event id delivered twice settles the invoice exactly once."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_concurrent_double_pay_is_serialized_by_row_lock() -> None:
    """Two concurrent payment attempts against one invoice never both succeed."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_manual_payment_recording() -> None:
    """record_manual_payment settles an invoice when the full amount is recorded."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_refund_amount_exceeding_balance_is_rejected() -> None:
    """A refund larger than the payment's remaining balance returns
    AmountExceedsBalance."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_unconfigured_provider_returns_503() -> None:
    """A payment attempt against an unconfigured PayPal returns NotConfigured -> 503."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
async def test_invoice_unpaid_endpoint_skips_already_paid_bookings() -> None:
    """POST /admin/sessions/{id}/invoice-unpaid only creates invoices
    for unpaid bookings."""
