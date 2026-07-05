from __future__ import annotations

# Unit coverage for invoice/refund error mapping, pay-token derivation/
# isolation, and deposit math -- see docs/design/05-payments-and-invoicing.md.
from decimal import Decimal
from uuid import uuid4

import pytest

from melpino_backend.domain.invoices.service import (
    LineItemInput,
    create_deposit_invoice,
    create_invoice,
    derive_pay_token,
    find_invoice_by_pay_token,
    hash_pay_token,
    pay_link_for_invoice,
)
from melpino_backend.errors import InvoiceError


def test_api_errors_status_map_is_complete() -> None:
    """Importing api/errors.py runs _verify_complete_mapping() at module
    load time -- if it raises, this import itself fails, so a bare
    successful import IS the assertion that every ErrorSet variant has an
    HTTP status mapping."""
    import melpino_backend.api.errors  # noqa: F401


def test_derive_pay_token_is_stable_and_secret_scoped() -> None:
    """The same (secret, invoice_id) always derives the same token --
    that stability is what lets every surface hand out the same emailed
    link -- while a different secret or a different invoice derives a
    completely different one."""
    invoice_id = uuid4()
    token_a = derive_pay_token("secret-one", invoice_id)
    token_b = derive_pay_token("secret-one", invoice_id)
    assert token_a == token_b
    assert derive_pay_token("secret-two", invoice_id) != token_a
    assert derive_pay_token("secret-one", uuid4()) != token_a
    # urlsafe (goes straight into a /pay/{token} path segment).
    assert "/" not in token_a and "+" not in token_a


async def test_invoice_pay_token_isolation(
    db_session, make_student, app_config
) -> None:
    """One invoice's pay token cannot read or pay a different invoice."""
    student = await make_student()
    result_a = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Course A", unit_price=Decimal("50.00"))],
    )
    result_b = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Course B", unit_price=Decimal("75.00"))],
    )
    invoice_id_a, raw_token_a = result_a.danger_ok
    invoice_id_b, _raw_token_b = result_b.danger_ok

    resolved = await find_invoice_by_pay_token(db_session, raw_token_a)
    assert resolved.is_ok
    assert resolved.danger_ok.id == invoice_id_a
    assert resolved.danger_ok.id != invoice_id_b


async def test_pay_token_lookup_rejects_unknown_token(
    db_session, app_config
) -> None:
    """A guessed/garbage token is InvoiceError.NotFound, not a crash."""
    bogus_token = derive_pay_token(app_config.session_secret, uuid4())
    result = await find_invoice_by_pay_token(db_session, bogus_token)
    assert result.is_err
    assert result.danger_err is InvoiceError.NotFound


async def test_pay_link_survives_secret_rotation_via_rekey(
    db_session, make_student, app_config
) -> None:
    """Rotating the signing secret kills every previously-issued link
    (global revocation lever) -- and pay_link_for_invoice heals the
    invoice forward so links issued AFTER the rotation work again."""
    from melpino_backend.app.config import AppConfig
    from melpino_backend.db.models.invoices import Invoice

    student = await make_student()
    result = await create_invoice(
        db_session,
        app_config,
        student.id,
        [LineItemInput(description="Course", unit_price=Decimal("10.00"))],
    )
    invoice_id, old_token = result.danger_ok

    rotated_cfg = AppConfig(session_secret="a-brand-new-secret")
    invoice = await db_session.get(Invoice, invoice_id)
    new_url = await pay_link_for_invoice(db_session, rotated_cfg, invoice)
    assert new_url is not None
    new_token = new_url.rsplit("/", 1)[-1]
    assert new_token != old_token

    # Old link is dead; the new derivation resolves.
    old_lookup = await find_invoice_by_pay_token(db_session, old_token)
    assert old_lookup.is_err
    new_lookup = await find_invoice_by_pay_token(db_session, new_token)
    assert new_lookup.is_ok
    assert invoice.pay_token_hash == hash_pay_token(new_token)


async def test_deposit_invoice_amount_is_deposit_times_party_size(
    db_session, make_student, app_config
) -> None:
    """create_deposit_invoice's amount = course.deposit * party_size."""
    student = await make_student()
    invoice, _raw_token = await create_deposit_invoice(
        db_session,
        app_config,
        student_id=student.id,
        booking_id=uuid4(),
        course_title="Intro Pottery",
        course_deposit=Decimal("25.00"),
        party_size=3,
    )
    assert invoice.amount_total == Decimal("75.00")
    assert invoice.status == "sent"


async def test_create_invoice_rejects_negative_unit_price() -> None:
    """LineItemInput's own pydantic constraint (unit_price >= 0) rejects a
    negative amount before it can ever corrupt amount_total."""
    with pytest.raises(Exception):
        LineItemInput(description="bad", unit_price=Decimal("-5.00"))
