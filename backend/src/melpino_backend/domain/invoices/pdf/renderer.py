from __future__ import annotations

# Renders an Invoice to PDF via latexmk + melpinoinvoice.cls +
# invoice.tex.jinja -- see docs/design/05-payments-and-invoicing.md
# ("copy the .cls + .tex.jinja + renderer chokepoint-escaping pipeline;
# re-letterhead with business_legal_name -- NEVER a hardcoded name -- and
# rename the .cls file melpinoinvoice.cls"). CRIB: logand.app
# backend/src/logand_backend/domain/invoices/pdf/renderer.py.
import asyncio
import os
import subprocess
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

import jinja2
from pydantic import BaseModel
from typani.result import Err, Ok, Result

from melpino_backend.errors import InvoiceError
from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.app.config import AppConfig

_log = get_logger(__name__)
_PDF_DIR = Path(__file__).parent

# Already LaTeX-safe literals -- these are interpolated directly,
# unescaped by latex_escape (fixed data, not user/admin-entered text).
# "$" MUST stay escaped: LaTeX's math-mode toggle, an unescaped one
# breaks the compile by leaving math mode open for the rest of the
# document. \texteuro/\textsterling (textcomp, loaded transitively via
# mathpazo) keep this file pure ASCII rather than embedding a literal
# euro/pound sign.
_CURRENCY_SYMBOLS = {"usd": r"\$", "eur": r"\texteuro{}", "gbp": r"\textsterling{}"}


def _currency_symbol(currency: str) -> str:
    """Falls back to the currency code itself (LaTeX-safe ASCII) rather
    than guessing a symbol this map doesn't know."""
    return _CURRENCY_SYMBOLS.get(currency.lower(), currency.upper() + " ")


# LaTeX's special characters, escaped one character at a time -- a
# sequential str.replace approach has to carefully order which character
# it escapes first (get backslash wrong and a later replacement's own
# inserted backslashes get re-escaped); a single per-character pass
# sidesteps that whole class of bug.
_LATEX_SPECIAL_CHARS = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "#": r"\#",
    "_": r"\_",
    "%": r"\%",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def latex_escape(text: object) -> str:
    """Escapes arbitrary text (student names, memos, line-item
    descriptions -- anything that isn't literal LaTeX source this module
    wrote itself) for safe interpolation into a .tex file. Every field
    that ultimately comes from user/admin-entered data MUST be escaped
    through this before reaching the template -- an unescaped $, &, or
    backslash from, say, an invoice memo would otherwise either break the
    LaTeX compile or let entered text inject arbitrary LaTeX commands
    into a legal/financial document."""
    return "".join(_LATEX_SPECIAL_CHARS.get(ch, ch) for ch in str(text))


def latex_escape_lines(text: object) -> str:
    """Like latex_escape, but preserves line breaks the admin actually
    typed (e.g. invoice_business_details' street/city/EIN lines) as real
    LaTeX line breaks -- a bare newline is otherwise interchangeable with
    any other whitespace in LaTeX source, silently collapsing a
    multi-line value into one run-on line."""
    return r"\\".join(latex_escape(line) for line in str(text).splitlines())


class InvoiceLineItemData(BaseModel):
    """One already-LaTeX-escaped line item, ready for the template."""

    model_config = {"frozen": True}

    description: str
    quantity: str
    unit_price: str
    amount: str
    unit: str


class InvoicePdfData(BaseModel):
    """Everything invoice.tex.jinja needs, already LaTeX-escaped -- the
    one chokepoint every field passes through, so escaping is applied
    exactly once instead of trusted to happen at each call site."""

    model_config = {"frozen": True}

    invoice_number: str
    invoice_date: str
    due_date: str
    status: str
    bill_to: str
    business_name: str
    business_details: str
    currency_upper: str
    currency_symbol: str
    amount_total: str
    line_items: list[InvoiceLineItemData]
    contact_email: str
    zelle_handle: str | None = None
    pay_url: str | None = None
    memo: str | None = None


def build_invoice_pdf_data(
    *,
    invoice_id: str,
    status: str,
    currency: str,
    amount_total: Decimal,
    due_date: str | None,
    created_at: str,
    memo: str | None,
    bill_to: str,
    line_items: list[tuple[str, Decimal, Decimal, Decimal, str | None]],
    business_name: str,
    business_details: str,
    contact_email: str,
    zelle_handle: str | None,
    pay_url: str | None,
) -> InvoicePdfData:
    """Assembles + LaTeX-escapes everything the template needs from raw
    domain values. `invoice_id` (a UUID) is used as the human-facing
    invoice number as-is -- there is no separate sequential
    invoice-numbering scheme. `line_items` carries a pre-computed
    line_total (the 4th tuple element) rather than recomputing quantity *
    unit_price here, so the PDF's rounding always matches whatever the
    caller already derived via currency.quantize_to_currency."""
    from melpino_backend.domain.payments.currency import format_major_units

    line_item_data = [
        InvoiceLineItemData(
            description=latex_escape(description),
            quantity=latex_escape(str(quantity)),
            unit_price=latex_escape(format_major_units(unit_price, currency)),
            amount=latex_escape(format_major_units(line_total, currency)),
            unit=latex_escape(unit) if unit else "",
        )
        for description, quantity, unit_price, line_total, unit in line_items
    ]
    return InvoicePdfData(
        invoice_number=latex_escape(invoice_id),
        invoice_date=latex_escape(created_at),
        due_date=latex_escape(due_date or "Upon receipt"),
        status=latex_escape(status.capitalize()),
        bill_to=latex_escape(bill_to),
        business_name=latex_escape(business_name),
        business_details=latex_escape_lines(business_details),
        currency_upper=latex_escape(currency.upper()),
        currency_symbol=_currency_symbol(currency),
        amount_total=latex_escape(format_major_units(amount_total, currency)),
        line_items=line_item_data,
        contact_email=latex_escape(contact_email),
        zelle_handle=latex_escape(zelle_handle) if zelle_handle else None,
        pay_url=pay_url,
        memo=latex_escape(memo) if memo else None,
    )


def _template_env() -> jinja2.Environment:
    # Custom delimiters (\VAR{}, \BLOCK{}) instead of Jinja2's default
    # {{ }}/{% %} -- LaTeX itself uses `{`/`}`/`%` constantly, so the
    # default Jinja2 syntax would collide with real LaTeX source
    # throughout the template.
    return jinja2.Environment(
        block_start_string=r"\BLOCK{",
        block_end_string="}",
        variable_start_string=r"\VAR{",
        variable_end_string="}",
        comment_start_string=r"\#{",
        comment_end_string="}",
        trim_blocks=True,
        lstrip_blocks=True,
        autoescape=False,
        loader=jinja2.FileSystemLoader(str(_PDF_DIR)),
    )


class PdfRenderError(Exception):
    """Raised when latexmk fails to compile the invoice -- carries the
    compile log for debugging."""

    def __init__(self, message: str, *, log: str) -> None:
        super().__init__(message)
        self.log = log


def render_invoice_pdf(data: InvoicePdfData) -> bytes:
    """Renders the Jinja2 .tex template with `data`, compiles it with
    latexmk, and returns the resulting PDF's bytes. Requires a LaTeX
    toolchain (latexmk + the packages melpinoinvoice.cls RequirePackage's)
    to actually be installed; there is no pure-Python fallback."""
    env = _template_env()
    template = env.get_template("invoice.tex.jinja")
    tex_source = template.render(**data.model_dump())

    with tempfile.TemporaryDirectory(prefix="melpino-invoice-pdf-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        tex_path = tmp_path / "invoice.tex"
        tex_path.write_text(tex_source, encoding="utf-8")

        result = subprocess.run(
            [
                "latexmk",
                "-pdf",
                "-interaction=nonstopmode",
                "-halt-on-error",
                f"-output-directory={tmp_dir}",
                str(tex_path),
            ],
            cwd=tmp_dir,
            # {**os.environ, ...}, NOT a bare {"TEXINPUTS": ...} -- passing
            # env= at all REPLACES the subprocess's entire environment
            # rather than extending it, which would silently wipe PATH
            # too. melpinoinvoice.cls lives in _PDF_DIR, not the temp
            # compile dir -- TEXINPUTS (trailing colon means "plus
            # LaTeX's own normal search path") is what latexmk uses to
            # find it.
            env={**os.environ, "TEXINPUTS": f"{_PDF_DIR}:"},
            capture_output=True,
            text=True,
        )

        pdf_path = tmp_path / "invoice.pdf"
        if result.returncode != 0 or not pdf_path.exists():
            _log.error(
                "invoice PDF compile failed",
                extra={
                    "invoice_number": data.invoice_number,
                    "returncode": result.returncode,
                    "latexmk_log": (result.stdout + result.stderr)[-4000:],
                },
            )
            raise PdfRenderError(
                "latexmk failed to compile invoice PDF",
                log=result.stdout + result.stderr,
            )
        return pdf_path.read_bytes()


async def generate_invoice_pdf(
    db: "AsyncSession", invoice_id: UUID, cfg: "AppConfig"
) -> Result[bytes, InvoiceError]:
    """Renders invoice.tex.jinja against melpinoinvoice.cls and compiles
    via latexmk (offloaded to a thread -- latexmk is a blocking
    subprocess)."""
    from sqlalchemy import select

    from melpino_backend.db.models.invoices import Invoice, InvoiceLineItem
    from melpino_backend.db.models.students import Student
    from melpino_backend.domain.payments.currency import quantize_to_currency

    invoice = await db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        return Err(InvoiceError.NotFound)

    student = await db.get(Student, invoice.student_id)
    bill_to = student.full_name if student is not None else ""

    line_items = (
        (
            await db.execute(
                select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)
            )
        )
        .scalars()
        .all()
    )
    line_item_tuples = [
        (
            li.description,
            li.quantity,
            li.unit_price,
            quantize_to_currency(li.quantity * li.unit_price, invoice.currency),
            li.unit,
        )
        for li in line_items
    ]

    data = build_invoice_pdf_data(
        invoice_id=str(invoice.id),
        status=invoice.status,
        currency=invoice.currency,
        amount_total=invoice.amount_total,
        due_date=invoice.due_date.isoformat() if invoice.due_date else None,
        created_at=invoice.created_at.isoformat(),
        memo=invoice.memo,
        bill_to=bill_to,
        line_items=line_item_tuples,
        business_name=cfg.invoice_business_name,
        business_details=cfg.invoice_business_details,
        contact_email=cfg.invoice_contact_email,
        zelle_handle=cfg.zelle_handle,
        pay_url=None,
    )
    try:
        pdf_bytes = await asyncio.to_thread(render_invoice_pdf, data)
    except PdfRenderError:
        # A LaTeX compile failure is an unrecoverable server-side bug (a
        # bad escape, a missing package) -- not a client-facing domain
        # error with its own recoverable meaning, so this re-raises
        # rather than mapping to an InvoiceError variant. The caller's
        # generic 500 handler (app.py's request-logging middleware) logs
        # the full traceback.
        raise
    return Ok(pdf_bytes)
