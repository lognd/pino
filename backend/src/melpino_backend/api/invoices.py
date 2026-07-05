from __future__ import annotations

# Admin invoice CRUD -- mirrors logand.app's api/invoices.py, keyed to
# students rather than customer accounts. See
# docs/design/05-payments-and-invoicing.md.
import argparse
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from melpino_backend.api.errors import to_http_exception
from melpino_backend.app.config import AppConfig
from melpino_backend.auth.sessions import SessionInfo, require_admin, require_staff
from melpino_backend.db.base import get_db
from melpino_backend.db.models.invoices import Invoice
from melpino_backend.domain.invoices import service
from melpino_backend.domain.invoices.refunds import RefundInput, refund_payment
from melpino_backend.domain.invoices.service import (
    LineItemInput,
    ManualPaymentInput,
    create_invoice,
    invoice_unpaid_bookings_for_session,
    pay_url_for,
    record_manual_payment,
)
from melpino_backend.domain.notifications.notify import notify_invoice_sent
from melpino_backend.errors import InvoiceError

router = APIRouter(prefix="/api/admin/invoices", tags=["admin-invoices"])
# Separate router (own prefix) for the session-scoped bulk action --
# "invoice everyone still unpaid for Saturday's class" reads naturally
# under /api/admin/sessions/{id}/..., not nested under /admin/invoices.
sessions_router = APIRouter(prefix="/api/admin/sessions", tags=["admin-invoices"])

_cfg = AppConfig.from_external(argparse.Namespace())


class LineItemRequest(BaseModel):
    """One line item on a create-invoice request."""

    model_config = {}

    description: str
    quantity: Decimal = Decimal(1)
    unit_price: Decimal
    unit: str | None = None


class InvoiceCreateRequest(BaseModel):
    """Admin's new-invoice form."""

    model_config = {}

    student_id: str
    line_items: list[LineItemRequest]
    memo: str | None = None


class InvoiceResponse(BaseModel):
    """Admin-facing invoice summary."""

    model_config = {}

    invoice_id: str
    student_id: str
    status: str
    amount_total: str
    currency: str
    memo: str | None
    needs_review: bool


def _to_response(invoice: Invoice) -> InvoiceResponse:
    return InvoiceResponse(
        invoice_id=str(invoice.id),
        student_id=str(invoice.student_id),
        status=invoice.status,
        amount_total=str(invoice.amount_total),
        currency=invoice.currency,
        memo=invoice.memo,
        needs_review=invoice.needs_review,
    )


class ManualPaymentRequest(BaseModel):
    """Admin's manual-payment form. client_request_id is REQUIRED (see
    domain/invoices/service.py's ManualPaymentInput doc comment)."""

    model_config = {}

    method: service.ManualPaymentMethod
    amount: Decimal
    note: str | None = None
    client_request_id: str


class RefundRequest(BaseModel):
    """Admin's refund form -- client_request_id is REQUIRED (see
    domain/invoices/refunds.py's own doc comment on why)."""

    model_config = {}

    payment_id: str
    amount: Decimal | None = None
    reason: str | None = None
    client_request_id: str


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> dict:
    """Aggregate invoice/payment/refund stats for the admin dashboard --
    thin wrapper over domain/invoices/stats.py. Declared BEFORE the
    /{invoice_id} routes so FastAPI never tries to parse "stats" as an
    invoice id."""
    from melpino_backend.domain.invoices.stats import get_invoice_stats

    stats = await get_invoice_stats(db)
    return stats.model_dump(mode="json")


@router.get("")
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> list[dict]:
    """Admin invoice listing (most recent first)."""
    rows = (
        (await db.execute(select(Invoice).order_by(Invoice.created_at.desc())))
        .scalars()
        .all()
    )
    return [_to_response(row).model_dump() for row in rows]


@router.post("")
async def create_invoice_endpoint(
    payload: InvoiceCreateRequest,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> dict:
    """Admin creates a new draft invoice."""
    result = await create_invoice(
        db,
        _cfg,
        UUID(payload.student_id),
        [
            LineItemInput(
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                unit=item.unit,
            )
            for item in payload.line_items
        ],
        memo=payload.memo,
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    invoice_id, raw_token = result.danger_ok
    invoice = await db.get(Invoice, invoice_id)
    assert invoice is not None
    body = _to_response(invoice).model_dump()
    body["pay_url"] = pay_url_for(_cfg, raw_token)
    return body


@router.post("/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> dict:
    """Admin sends (or re-sends) the invoice email -- flips draft ->
    sent (idempotent for an already-sent invoice) and emails the
    pay-by-link URL. The link is the invoice's one stable derived token
    (see derive_pay_token / pay_link_for_invoice), so a re-send carries
    the SAME URL as the original -- nothing is invalidated by
    re-sending."""
    invoice = await service.lock_invoice_for_update(db, UUID(invoice_id))
    if invoice is None or invoice.deleted_at is not None:
        raise to_http_exception(InvoiceError.NotFound)
    if invoice.status == "draft":
        invoice.status = "sent"
        await db.flush()
    pay_url = await service.pay_link_for_invoice(db, _cfg, invoice)
    body = _to_response(invoice).model_dump()
    await db.commit()
    await db.refresh(invoice)
    await notify_invoice_sent(db, _cfg, invoice, pay_url=pay_url)
    body["pay_url"] = pay_url
    return body


@router.post("/{invoice_id}/manual-payment")
async def record_manual_payment_endpoint(
    invoice_id: str,
    payload: ManualPaymentRequest,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> dict:
    """Admin records a Zelle/cash/card-reader-outside-the-system payment."""
    result = await record_manual_payment(
        db,
        UUID(invoice_id),
        session.user_id,
        ManualPaymentInput(
            method=payload.method,
            amount=payload.amount,
            note=payload.note,
            client_request_id=UUID(payload.client_request_id),
        ),
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    await db.commit()
    return {"payment_id": str(result.danger_ok)}


@router.post("/{invoice_id}/refund")
async def refund_payment_endpoint(
    invoice_id: str,
    payload: RefundRequest,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_admin),
) -> dict:
    """Admin-only (not staff -- see docs/design/02's authorization model)."""
    result = await refund_payment(
        db,
        _cfg,
        UUID(invoice_id),
        session.user_id,
        RefundInput(
            payment_id=UUID(payload.payment_id),
            amount=payload.amount,
            reason=payload.reason,
            client_request_id=UUID(payload.client_request_id),
        ),
    )
    if result.is_err:
        raise to_http_exception(result.danger_err)
    return {"refund_id": str(result.danger_ok)}


@sessions_router.post("/{class_session_id}/invoice-unpaid")
async def invoice_unpaid_for_session(
    class_session_id: str,
    db: AsyncSession = Depends(get_db),
    session: SessionInfo = Depends(require_staff),
) -> list[dict]:
    """ "Invoice everyone still unpaid for Saturday's class" -- creates one
    invoice per confirmed booking on the session that has no invoice_id
    yet, skipping already-invoiced bookings."""
    invoices = await invoice_unpaid_bookings_for_session(
        db, _cfg, UUID(class_session_id)
    )
    await db.commit()
    return [_to_response(inv).model_dump() for inv in invoices]
