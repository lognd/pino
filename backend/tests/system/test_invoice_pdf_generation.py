from __future__ import annotations

# Real-compile system test for the invoice PDF renderer -- see
# docs/design/05-payments-and-invoicing.md's P4 test gaps and
# docs/design/12-testing-strategy.md. CRIB: logand.app
# backend/tests/system/test_invoice_pdf_generation.py.
import shutil
from decimal import Decimal

import pytest

from melpino_backend.domain.invoices.pdf.renderer import (
    PdfRenderError,
    build_invoice_pdf_data,
    render_invoice_pdf,
)

# Actually compiling requires a real LaTeX toolchain (latexmk + the
# texlive-* packages melpinoinvoice.cls's \RequirePackage list needs) --
# present in the real deployed image and (per this mission's instructions)
# on this host, but the skip convention is kept regardless so the suite
# stays green on a machine without a ~1GB texlive install, same as the
# postgres testcontainers fixture skipping when Docker isn't available.
pytestmark = pytest.mark.skipif(
    shutil.which("latexmk") is None,
    reason="latexmk not installed -- see backend/Dockerfile texlive packages",
)


def test_render_invoice_pdf_produces_a_real_pdf() -> None:
    data = build_invoice_pdf_data(
        invoice_id="11111111-1111-1111-1111-111111111111",
        status="sent",
        currency="usd",
        amount_total=Decimal("299.00"),
        due_date="2026-08-01",
        created_at="2026-07-01",
        memo="Thanks! 50% off applied & a $5 fee_note.",
        bill_to="Customer Name",
        line_items=[
            (
                "Consulting (10 hrs)",
                Decimal("10"),
                Decimal("25.00"),
                Decimal("250.00"),
                "hr",
            ),
            (
                "Rush fee & handling",
                Decimal("1"),
                Decimal("49.00"),
                Decimal("49.00"),
                None,
            ),
        ],
        business_name="melpino",
        business_details="123 Example St, Some City, ST 00000",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url="https://melpino.test/invoices/11111111-1111-1111-1111-111111111111/pay",
    )

    pdf_bytes = render_invoice_pdf(data)

    # The real, minimal signal that this is an actual PDF (not an error
    # page, not empty output) -- every PDF file starts with this magic
    # byte sequence.
    assert pdf_bytes.startswith(b"%PDF-")
    # A real compiled invoice is comfortably more than a few KB; a
    # near-empty file would indicate the compile silently produced a
    # near-blank page rather than genuinely failing (which would have
    # raised PdfRenderError instead).
    assert len(pdf_bytes) > 5_000


def test_render_invoice_pdf_raises_on_genuinely_broken_input() -> None:
    # A raw (unescaped) `$` reaching the template is exactly the bug this
    # module's own latex_escape exists to prevent -- constructing
    # InvoicePdfData by hand (bypassing build_invoice_pdf_data's escaping)
    # to confirm render_invoice_pdf surfaces a real compile failure as
    # PdfRenderError rather than silently producing a broken/truncated PDF.
    from melpino_backend.domain.invoices.pdf.renderer import InvoicePdfData

    data = InvoicePdfData(
        invoice_number="x",
        invoice_date="2026-07-01",
        due_date="Upon receipt",
        status="Sent",
        bill_to="customer@example.com",
        business_name="melpino",
        business_details="",
        currency_upper="USD",
        currency_symbol="$",  # deliberately unescaped
        amount_total="10.00",
        line_items=[],
        contact_email="billing@melpino.test",
    )

    with pytest.raises(PdfRenderError):
        render_invoice_pdf(data)
