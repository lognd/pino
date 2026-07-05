from __future__ import annotations

# Unit coverage for the invoice PDF renderer's LaTeX-escape chokepoint --
# see docs/design/05-payments-and-invoicing.md's P4 test gaps and
# docs/design/12-testing-strategy.md. CRIB: logand.app
# backend/tests/unit/test_invoice_pdf.py.
from decimal import Decimal

from melpino_backend.domain.invoices.pdf.renderer import (
    _template_env,
    build_invoice_pdf_data,
    latex_escape,
    latex_escape_lines,
)


def test_latex_escape_handles_every_special_character() -> None:
    # One string containing every character LaTeX treats specially -- a
    # wrong escape (or a missed one) here would either break every
    # invoice PDF that happened to contain that character, or silently
    # let it through as raw LaTeX source.
    raw = r"100% & $5 fee_note {braces} ~tilde ^caret \backslash # hash"
    escaped = latex_escape(raw)

    assert r"\%" in escaped
    assert r"\&" in escaped
    assert r"\$" in escaped
    assert r"\_" in escaped
    assert r"\{" in escaped
    assert r"\}" in escaped
    assert r"\textasciitilde{}" in escaped
    assert r"\textasciicircum{}" in escaped
    assert r"\textbackslash{}" in escaped
    assert r"\#" in escaped


def test_latex_escape_leaves_plain_text_untouched() -> None:
    assert latex_escape("Consulting services") == "Consulting services"
    assert latex_escape("") == ""


def test_latex_escape_handles_non_string_input() -> None:
    assert latex_escape(Decimal("10.00")) == "10.00"
    assert latex_escape(42) == "42"


def test_latex_escape_lines_preserves_newlines_as_line_breaks() -> None:
    escaped = latex_escape_lines(
        "123 Main Street\nSpringfield, IL 62704\nEIN: 12-3456789"
    )
    assert escaped == r"123 Main Street\\Springfield, IL 62704\\EIN: 12-3456789"


def test_latex_escape_lines_still_escapes_special_characters_per_line() -> None:
    escaped = latex_escape_lines("100% off\n$5 fee")
    assert escaped == r"100\% off\\\$5 fee"


def test_latex_escape_lines_single_line_matches_plain_escape() -> None:
    assert latex_escape_lines("no newlines here") == latex_escape("no newlines here")


# Hostile memo/description/bill_to strings -- the actual "chokepoint"
# obligation from TODO.md's P4 test gap line: every free-text field must
# come out of build_invoice_pdf_data already escaped for safe .tex
# interpolation.


def test_build_invoice_pdf_data_escapes_hostile_memo() -> None:
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="sent",
        currency="usd",
        amount_total=Decimal("50.00"),
        due_date="2026-08-01",
        created_at="2026-07-01",
        memo=r"50% off & a $5 fee_note {with braces} \injected",
        bill_to="Customer Name",
        line_items=[],
        business_name="melpino",
        business_details="",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url=None,
    )
    assert data.memo == (
        r"50\% off \& a \$5 fee\_note \{with braces\} \textbackslash{}injected"
    )


def test_build_invoice_pdf_data_escapes_hostile_bill_to() -> None:
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="sent",
        currency="usd",
        amount_total=Decimal("50.00"),
        due_date=None,
        created_at="2026-07-01",
        memo=None,
        bill_to=r"O'Brien & Sons $$ {LLC}",
        line_items=[],
        business_name="melpino",
        business_details="",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url=None,
    )
    assert data.bill_to == r"O'Brien \& Sons \$\$ \{LLC\}"


def test_build_invoice_pdf_data_escapes_hostile_line_item_description() -> None:
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="sent",
        currency="usd",
        amount_total=Decimal("50.00"),
        due_date=None,
        created_at="2026-07-01",
        memo=None,
        bill_to="Customer",
        line_items=[
            (
                r"Widget & gadget_v2 {special} #1 100%",
                Decimal("2"),
                Decimal("25.00"),
                Decimal("50.00"),
                "ea",
            )
        ],
        business_name="melpino",
        business_details="",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url=None,
    )
    assert data.line_items[0].description == (
        r"Widget \& gadget\_v2 \{special\} \#1 100\%"
    )
    assert data.line_items[0].amount == "50.00"
    assert data.line_items[0].unit == "ea"
    assert data.status == "Sent"


def test_build_invoice_pdf_data_escapes_hostile_business_details_multiline() -> None:
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="sent",
        currency="usd",
        amount_total=Decimal("50.00"),
        due_date=None,
        created_at="2026-07-01",
        memo=None,
        bill_to="Customer",
        line_items=[],
        business_name="melpino",
        business_details="123 Main St & Co.\n$100 Suite\nEIN: 12-3456789",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url=None,
    )
    assert data.business_details == r"123 Main St \& Co.\\\$100 Suite\\EIN: 12-3456789"


def test_build_invoice_pdf_data_zero_decimal_currency_has_no_fractional_digits() -> (
    None
):
    """JPY (0dp) -- amounts must render as whole numbers, not a hardcoded 2dp."""
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="sent",
        currency="jpy",
        amount_total=Decimal("3000"),
        due_date=None,
        created_at="2026-07-01",
        memo=None,
        bill_to="Customer",
        line_items=[("Widget", Decimal("3"), Decimal("1000"), Decimal("3000"), None)],
        business_name="melpino",
        business_details="",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url=None,
    )
    assert data.amount_total == "3000"
    assert data.line_items[0].unit_price == "1000"
    assert data.line_items[0].amount == "3000"


def test_build_invoice_pdf_data_defaults_due_date_when_absent() -> None:
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="draft",
        currency="usd",
        amount_total=Decimal("0.00"),
        due_date=None,
        created_at="2026-07-01",
        memo=None,
        bill_to="Customer",
        line_items=[],
        business_name="melpino",
        business_details="",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url=None,
    )
    assert data.due_date == "Upon receipt"
    assert data.memo is None
    assert data.pay_url is None


def test_template_renders_hostile_memo_without_breaking_brace_balance() -> None:
    """Confirms the Jinja2 template renders the hostile-string test
    fixture's escaped output (variable substitution only, no LaTeX
    compile required) with balanced braces -- a real compile is covered
    separately by tests/system/test_invoice_pdf_generation.py."""
    data = build_invoice_pdf_data(
        invoice_id="abc-123",
        status="sent",
        currency="usd",
        amount_total=Decimal("75.00"),
        due_date="2026-08-01",
        created_at="2026-07-01",
        memo=r"100% & $5 fee_note {braces} ~tilde ^caret \backslash # hash",
        bill_to="Customer & Co. {LLC}",
        line_items=[
            (
                r"Widget & gadget_v2",
                Decimal("3"),
                Decimal("25.00"),
                Decimal("75.00"),
                None,
            )
        ],
        business_name="melpino",
        business_details="123 Example St",
        contact_email="billing@melpino.test",
        zelle_handle=None,
        pay_url="https://melpino.test/pay/abc",
    )
    env = _template_env()
    template = env.get_template("invoice.tex.jinja")
    tex_source = template.render(**data.model_dump())

    assert tex_source.count("{") == tex_source.count("}")
    assert "Widget" in tex_source
    assert r"\href{https://melpino.test/pay/abc}" in tex_source
