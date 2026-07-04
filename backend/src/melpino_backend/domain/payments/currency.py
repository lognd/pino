from __future__ import annotations

# Money <-> minor-units conversion, currency decimal-place lookup -- see
# docs/design/05-payments-and-invoicing.md ("copy logand.app unchanged").
# CRIB: logand.app backend/src/logand_backend/domain/payments/currency.py
# (zero-decimal and three-decimal currency lists, ROUND_HALF_UP for
# provider-facing amounts).
from decimal import Decimal


def decimal_places(currency: str) -> int:
    """0/2/3 decimal places for the given ISO currency code."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


def to_minor_units(amount: Decimal, currency: str) -> int:
    """Converts a major-unit Decimal to the integer minor-unit amount
    Stripe's API expects."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


def from_minor_units(amount: int, currency: str) -> Decimal:
    """Inverse of to_minor_units."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


def format_major_units(amount: Decimal, currency: str) -> str:
    """Formats a major-unit amount to PayPal's fixed-point `value` string."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


def quantize_to_currency(
    amount: Decimal, currency: str, rounding: str | None = None
) -> Decimal:
    """Re-quantizes a wide Numeric(_,3) stored amount to the currency's
    real display precision."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
