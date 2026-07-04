from __future__ import annotations

# Admin invoice CRUD -- mirrors logand.app's api/invoices.py, keyed to
# students rather than customer accounts. See
# docs/design/05-payments-and-invoicing.md.
from fastapi import APIRouter, Depends

from melpino_backend.auth.sessions import SessionInfo, require_staff

router = APIRouter(prefix="/api/admin/invoices", tags=["admin-invoices"])


@router.get("")
async def list_invoices(session: SessionInfo = Depends(require_staff)) -> list[dict]:
    """Admin invoice listing."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("")
async def create_invoice(session: SessionInfo = Depends(require_staff)) -> dict:
    """Admin creates a new invoice."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/{invoice_id}/send")
async def send_invoice(
    invoice_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin sends (or re-sends) the invoice email."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/{invoice_id}/manual-payment")
async def record_manual_payment(
    invoice_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin records a Zelle/cash/card-reader-outside-the-system payment."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/{invoice_id}/refund")
async def refund_payment(
    invoice_id: str, session: SessionInfo = Depends(require_staff)
) -> dict:
    """Admin-only (not staff -- see docs/design/02's authorization model)."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


@router.post("/admin/sessions/{class_session_id}/invoice-unpaid")
async def invoice_unpaid_for_session(
    class_session_id: str, session: SessionInfo = Depends(require_staff)
) -> list[dict]:
    """ "Invoice everyone still unpaid for Saturday's class" -- see
    docs/design/05-payments-and-invoicing.md."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
