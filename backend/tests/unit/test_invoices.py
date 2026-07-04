from __future__ import annotations

# Unit coverage for invoice/refund error mapping and pay-token isolation
# -- see docs/design/05-payments-and-invoicing.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
def test_api_errors_status_map_is_complete() -> None:
    """_verify_complete_mapping does not raise -- every ErrorSet variant is mapped."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
def test_invoice_pay_token_isolation() -> None:
    """One invoice's pay token cannot read or pay a different invoice."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
def test_deposit_invoice_amount_is_deposit_times_party_size() -> None:
    """create_deposit_invoice's amount = course.deposit * booking.party_size."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/05-payments-and-invoicing.md")
def test_amount_mismatch_returns_error() -> None:
    """A client-supplied amount that disagrees with the server total is rejected."""
