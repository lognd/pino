from __future__ import annotations

# System test for GET /api/config -- see docs/design/00-overview.md and
# docs/design/05-payments-and-invoicing.md. Mounts only config_public's
# router in a bare FastAPI() (no DB involved at all, see
# api/config_public.py's own docstring) so this test never depends on the
# other in-progress auth/rate_limit/db submodules.
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from melpino_backend.api import config_public


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(config_public.router)
    return app


async def test_get_public_config_full_shape(monkeypatch) -> None:
    """Every payment method configured -> all reported True/non-null.
    PAYMENT_PROCESSOR_SECRET must be set explicitly here -- AppConfig's
    own default is None/unconfigured (see app/config.py)."""
    monkeypatch.setenv("BUSINESS_LEGAL_NAME", "Test Co, LLC")
    monkeypatch.setenv("BUSINESS_SHORT_NAME", "Test Co")
    monkeypatch.setenv("ZELLE_HANDLE", "test@zelle.example")
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "client-id")
    monkeypatch.setenv("PAYPAL_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("PAYMENT_PROCESSOR_SECRET", "sk_test_fake")

    app = _build_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/config")

    assert resp.status_code == 200
    assert resp.json() == {
        "business_legal_name": "Test Co, LLC",
        "business_short_name": "Test Co",
        "payment_methods": {
            "stripe": True,
            "paypal": True,
            "zelle_handle": "test@zelle.example",
        },
    }


async def test_get_public_config_paypal_and_zelle_unconfigured(monkeypatch) -> None:
    """PayPal/Zelle unset -> reported as unconfigured (False / None)."""
    monkeypatch.setenv("BUSINESS_LEGAL_NAME", "Test Co, LLC")
    monkeypatch.setenv("BUSINESS_SHORT_NAME", "Test Co")
    monkeypatch.delenv("ZELLE_HANDLE", raising=False)
    monkeypatch.delenv("PAYPAL_CLIENT_ID", raising=False)
    monkeypatch.delenv("PAYPAL_CLIENT_SECRET", raising=False)

    app = _build_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/config")

    assert resp.status_code == 200
    body = resp.json()
    assert body["payment_methods"]["paypal"] is False
    assert body["payment_methods"]["zelle_handle"] is None


async def test_get_public_config_stripe_unconfigured_by_default(monkeypatch) -> None:
    """PAYMENT_PROCESSOR_SECRET unset -> stripe reported False -- AppConfig's
    default is None/unconfigured (see app/config.py), not a fake secret
    that would make an unconfigured deployment look stripe-ready."""
    monkeypatch.setenv("BUSINESS_LEGAL_NAME", "Test Co, LLC")
    monkeypatch.setenv("BUSINESS_SHORT_NAME", "Test Co")
    monkeypatch.delenv("PAYMENT_PROCESSOR_SECRET", raising=False)

    app = _build_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/config")

    assert resp.status_code == 200
    assert resp.json()["payment_methods"]["stripe"] is False
