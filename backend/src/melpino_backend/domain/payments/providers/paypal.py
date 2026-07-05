from __future__ import annotations

# PayPal Orders v2 client (optional provider, gracefully 503s when
# unconfigured) -- see docs/design/05-payments-and-invoicing.md ("copy
# logand.app unchanged"). CRIB: logand.app
# backend/src/logand_backend/domain/payments/providers/paypal.py.
#
# DELTA vs logand: logand's create_order derives its own return/cancel
# URL from a customer-session pay page (`{public_base_url}/invoices/
# {invoice_id}/pay`). Melpino has no customer accounts -- the caller
# (domain/invoices/service.py / api/invoices_public.py) already knows the
# pay-token URL for this invoice, so create_order takes `pay_url`
# explicitly instead of re-deriving it from an invoice id.
from decimal import Decimal
from typing import TYPE_CHECKING

import httpx
from pydantic import BaseModel
from typani.result import Err, Ok, Result

from melpino_backend.domain.payments.currency import format_major_units
from melpino_backend.errors import PaymentProviderError
from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from melpino_backend.app.config import AppConfig

_log = get_logger(__name__)

# https://api-m.sandbox.paypal.com / https://api-m.paypal.com -- PayPal's
# own naming for its two REST API environments (not "test"/"prod").
_SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
_LIVE_BASE = "https://api-m.paypal.com"


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
    # PayPal's own echo of the `reference_id` set on create_order (the
    # invoice id, as a string) -- callers MUST verify this matches the
    # invoice they're capturing against before trusting the capture at
    # all (see api/invoices_public.py's capture route).
    reference_id: str | None
    # PayPal refunds are issued against THIS id, not order_id.
    capture_id: str


class PayPalRefund(BaseModel):
    """A PayPal refund's id and status."""

    model_config = {"frozen": True}

    refund_id: str
    status: str


def is_configured(cfg: "AppConfig") -> bool:
    """True once real PayPal API credentials are actually set -- every
    caller checks this BEFORE ever calling create_order/capture_order, so
    the graceful "not hooked up yet, use Zelle instead" path never
    depends on a real network call failing first."""
    return bool(cfg.paypal_client_id and cfg.paypal_client_secret)


def _api_base(cfg: "AppConfig") -> str:
    if cfg.paypal_api_base:
        return cfg.paypal_api_base
    return _SANDBOX_BASE if cfg.paypal_mode == "sandbox" else _LIVE_BASE


async def _get_access_token(
    client: httpx.AsyncClient, cfg: "AppConfig"
) -> Result[str, PaymentProviderError]:
    # PayPal's OAuth2 client-credentials flow -- a fresh token per call
    # rather than caching one: simpler, and this is a low-volume path.
    try:
        resp = await client.post(
            f"{_api_base(cfg)}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=(cfg.paypal_client_id or "", cfg.paypal_client_secret or ""),
        )
        resp.raise_for_status()
    except httpx.HTTPError:
        _log.warning("paypal oauth2 token request failed")
        return Err(PaymentProviderError.RequestFailed)
    return Ok(resp.json()["access_token"])


async def create_order(
    cfg: "AppConfig",
    invoice_id: str,
    amount: Decimal,
    currency: str,
    pay_url: str,
) -> Result[PayPalOrder, PaymentProviderError]:
    """Creates a PayPal order for an invoice's remaining balance.
    `pay_url` is the invoice's own pay-by-link URL (return_url ==
    cancel_url -- PayPal appends "?token=<order_id>" on redirect, and the
    frontend's Pay page watches for that param to auto-capture)."""
    if not is_configured(cfg):
        return Err(PaymentProviderError.NotConfigured)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_result = await _get_access_token(client, cfg)
        if token_result.is_err:
            return Err(token_result.danger_err)
        token = token_result.danger_ok

        try:
            resp = await client.post(
                f"{_api_base(cfg)}/v2/checkout/orders",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "intent": "CAPTURE",
                    "purchase_units": [
                        {
                            "reference_id": invoice_id,
                            "amount": {
                                "currency_code": currency.upper(),
                                "value": format_major_units(amount, currency),
                            },
                        }
                    ],
                    "application_context": {
                        "return_url": pay_url,
                        "cancel_url": pay_url,
                    },
                },
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            _log.warning(
                "paypal create_order request failed", extra={"invoice_id": invoice_id}
            )
            return Err(PaymentProviderError.RequestFailed)

        body = resp.json()
        approval_url = next(
            (
                link["href"]
                for link in body.get("links", [])
                if link.get("rel") == "approve"
            ),
            None,
        )
        _log.info(
            "paypal order created",
            extra={"invoice_id": invoice_id, "order_id": body["id"]},
        )
        return Ok(PayPalOrder(order_id=body["id"], approval_url=approval_url))


def _capture_from_order_body(body: dict) -> PayPalCapture | None:
    """Returns None (rather than raising) when the order body has no
    purchase_units/payments/captures entry to read -- e.g. a VOIDED or
    otherwise never-captured order. Callers polling a previously-PENDING
    order must treat this as "no verdict available" and surface it as a
    Result error rather than letting a KeyError/IndexError escape."""
    purchase_units = body.get("purchase_units") or []
    if not purchase_units:
        return None
    captures = (purchase_units[0].get("payments") or {}).get("captures") or []
    if not captures:
        return None
    capture = captures[0]
    return PayPalCapture(
        order_id=body["id"],
        status=capture["status"],
        captured_amount=Decimal(capture["amount"]["value"]),
        captured_currency=capture["amount"]["currency_code"],
        reference_id=purchase_units[0].get("reference_id"),
        capture_id=capture["id"],
    )


async def _get_order(
    client: httpx.AsyncClient, cfg: "AppConfig", token: str, order_id: str
) -> Result[PayPalCapture, PaymentProviderError]:
    try:
        resp = await client.get(
            f"{_api_base(cfg)}/v2/checkout/orders/{order_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
    except httpx.HTTPError:
        return Err(PaymentProviderError.RequestFailed)
    capture = _capture_from_order_body(resp.json())
    if capture is None:
        return Err(PaymentProviderError.RequestFailed)
    return Ok(capture)


async def capture_order(
    cfg: "AppConfig", order_id: str, idempotency_key: str | None = None
) -> Result[PayPalCapture, PaymentProviderError]:
    """idempotency_key, when given, is sent as PayPal-Request-Id -- a
    retry with the SAME key returns PayPal's original capture response
    instead of issuing a second real charge attempt. As a secondary
    safeguard, an ORDER_ALREADY_CAPTURED error from PayPal is treated as
    success: the order is re-fetched and its existing capture returned."""
    if not is_configured(cfg):
        return Err(PaymentProviderError.NotConfigured)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_result = await _get_access_token(client, cfg)
        if token_result.is_err:
            return Err(token_result.danger_err)
        token = token_result.danger_ok

        headers = {"Authorization": f"Bearer {token}"}
        if idempotency_key is not None:
            headers["PayPal-Request-Id"] = idempotency_key

        try:
            resp = await client.post(
                f"{_api_base(cfg)}/v2/checkout/orders/{order_id}/capture",
                headers=headers,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            already_captured = False
            if exc.response.status_code == 422:
                try:
                    err_body = exc.response.json()
                except ValueError:
                    err_body = {}
                already_captured = any(
                    detail.get("issue") == "ORDER_ALREADY_CAPTURED"
                    for detail in err_body.get("details", [])
                )
            if not already_captured:
                _log.warning(
                    "paypal capture_order failed", extra={"order_id": order_id}
                )
                return Err(PaymentProviderError.RequestFailed)
            _log.info(
                "paypal capture already captured -- re-fetching order",
                extra={"order_id": order_id},
            )
            return await _get_order(client, cfg, token, order_id)
        except httpx.HTTPError:
            return Err(PaymentProviderError.RequestFailed)

        capture = _capture_from_order_body(resp.json())
        if capture is None:
            return Err(PaymentProviderError.RequestFailed)
        _log.info("paypal order captured", extra={"order_id": order_id})
        return Ok(capture)


async def get_order_status(
    cfg: "AppConfig", order_id: str
) -> Result[PayPalCapture, PaymentProviderError]:
    """Polls a single order's current capture status -- used by
    reconcile_pending_paypal_captures to settle a Payment recorded
    "pending" (PayPal delivers no webhook this app subscribes to for
    capture completion, so polling is the only way to learn the
    outcome)."""
    if not is_configured(cfg):
        return Err(PaymentProviderError.NotConfigured)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_result = await _get_access_token(client, cfg)
        if token_result.is_err:
            return Err(token_result.danger_err)
        token = token_result.danger_ok
        return await _get_order(client, cfg, token, order_id)


async def refund_capture(
    cfg: "AppConfig",
    capture_id: str,
    amount: Decimal,
    currency: str,
    idempotency_key: str | None = None,
) -> Result[PayPalRefund, PaymentProviderError]:
    """Refunds (fully or partially) a completed capture -- keyed on the
    CAPTURE id, not the order id. idempotency_key, when given, is sent as
    PayPal-Request-Id so a retry returns PayPal's original response
    instead of issuing a second real refund."""
    if not is_configured(cfg):
        return Err(PaymentProviderError.NotConfigured)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_result = await _get_access_token(client, cfg)
        if token_result.is_err:
            return Err(token_result.danger_err)
        token = token_result.danger_ok

        headers = {"Authorization": f"Bearer {token}"}
        if idempotency_key is not None:
            headers["PayPal-Request-Id"] = idempotency_key

        try:
            resp = await client.post(
                f"{_api_base(cfg)}/v2/payments/captures/{capture_id}/refund",
                headers=headers,
                json={
                    "amount": {
                        "value": format_major_units(amount, currency),
                        "currency_code": currency.upper(),
                    }
                },
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            _log.warning(
                "paypal refund_capture failed", extra={"capture_id": capture_id}
            )
            return Err(PaymentProviderError.RequestFailed)

        body = resp.json()
        _log.info("paypal refund issued", extra={"capture_id": capture_id})
        return Ok(PayPalRefund(refund_id=body["id"], status=body["status"]))


async def get_refund_status(
    cfg: "AppConfig", refund_id: str
) -> Result[PayPalRefund, PaymentProviderError]:
    """Polls a single refund's current status -- PayPal delivers no
    webhook this app subscribes to for refund completion, so a refund
    recorded "pending" has no other way to ever settle."""
    if not is_configured(cfg):
        return Err(PaymentProviderError.NotConfigured)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_result = await _get_access_token(client, cfg)
        if token_result.is_err:
            return Err(token_result.danger_err)
        token = token_result.danger_ok

        try:
            resp = await client.get(
                f"{_api_base(cfg)}/v2/payments/refunds/{refund_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return Err(PaymentProviderError.RequestFailed)

        body = resp.json()
        return Ok(PayPalRefund(refund_id=body["id"], status=body["status"]))
