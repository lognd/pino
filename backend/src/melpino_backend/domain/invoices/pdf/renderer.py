from __future__ import annotations

# Renders an Invoice to PDF via latexmk + melpinoinvoice.cls +
# invoice.tex.jinja -- see docs/design/05-payments-and-invoicing.md
# ("copy the .cls + .tex.jinja + renderer chokepoint-escaping pipeline;
# re-letterhead with business_legal_name -- NEVER a hardcoded name -- and
# rename the .cls file melpinoinvoice.cls"). CRIB: logand.app
# backend/src/logand_backend/domain/invoices/pdf/renderer.py.
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from typani.result import Result

from melpino_backend.errors import InvoiceError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig

_PDF_DIR = Path(__file__).parent


class PdfRenderError(Exception):
    """Raised when latexmk fails to compile the invoice -- carries the
    compile log for debugging."""

    def __init__(self, message: str, *, log: str) -> None:
        super().__init__(message)
        self.log = log


def latex_escape(text: str) -> str:
    """Escapes LaTeX's special characters one character at a time -- never
    via sequential str.replace (which mis-orders backslash escaping)."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)


async def generate_invoice_pdf(
    db: "AsyncSession", invoice_id: UUID, cfg: "AppConfig"
) -> Result[bytes, InvoiceError]:
    """Renders invoice.tex.jinja against melpinoinvoice.cls and compiles
    via latexmk (offloaded to a thread -- latexmk is a blocking subprocess)."""
    raise NotImplementedError(
        "see docs/design/05-payments-and-invoicing.md"
    )  # TODO(impl)
