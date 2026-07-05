from __future__ import annotations

# Aggregate invoice/payment/refund stats for the admin dashboard -- see
# docs/design/05-payments-and-invoicing.md ("copy logand.app unchanged").
# CRIB: logand.app backend/src/logand_backend/domain/invoices/stats.py --
# copied near-verbatim (query shapes, the double-count guards around
# refunds/lost disputes, the fixed status-key dict); the only melpino
# delta is that invoices key on student_id, which no stats query touches.
from decimal import Decimal
from typing import TYPE_CHECKING

from pydantic import BaseModel
from sqlalchemy import func, select

from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_log = get_logger(__name__)

# Every real Invoice.status value -- fixed here rather than derived so the
# response always has one key per status (0, not missing) even when a
# status has no rows at all.
_INVOICE_STATUSES = ("draft", "sent", "paid", "overdue", "void", "refunded")
_OPEN_DISPUTE_STATUSES = ("needs_response", "under_review")

# These aggregates sum across every invoice regardless of currency (never
# grouped by currency, matching logand) -- quantize to 2dp for display.
_STATS_DISPLAY_QUANTUM = Decimal("0.01")


def _quantize_stat(amount: Decimal) -> Decimal:
    """2dp display quantum for cross-currency aggregate figures."""
    return amount.quantize(_STATS_DISPLAY_QUANTUM)


class InvoiceStatusBreakdown(BaseModel):
    """Count + summed amount_total for one invoice status."""

    model_config = {"frozen": True}

    count: int
    amount_total: Decimal


class PaymentMethodBreakdown(BaseModel):
    """Count + summed amount for one payment method."""

    model_config = {"frozen": True}

    count: int
    amount: Decimal


class DisputeBreakdown(BaseModel):
    """Per-dispute-status counts."""

    model_config = {"frozen": True}

    needs_response: int
    under_review: int
    won: int
    lost: int


class InvoiceStats(BaseModel):
    """The admin stats page's whole payload -- see each field's comment
    for what it does and does not double-count."""

    model_config = {"frozen": True}

    by_status: dict[str, InvoiceStatusBreakdown]
    # Gross money that has actually moved through this system (every
    # succeeded/refunded/partially_refunded Payment), before refunds.
    total_collected: Decimal
    # Sum of every succeeded Refund.amount, all time.
    total_refunded: Decimal
    # total_collected - total_refunded - the not-already-refunded portion
    # of lost-dispute clawbacks -- what the business actually kept.
    net_collected: Decimal
    # Money still owed on payable (sent/overdue) invoices, net of each
    # invoice's own payments so far -- NOT raw amount_total, which would
    # double-count partially-paid invoices against total_collected.
    outstanding: Decimal
    by_payment_method: dict[str, PaymentMethodBreakdown]
    open_disputes: int
    disputes: DisputeBreakdown


async def get_invoice_stats(db: "AsyncSession") -> InvoiceStats:
    """Aggregate, read-only breakdown for the admin stats page -- every
    number computed fresh from invoices/payments/refunds on each call (no
    cached counters to drift out of sync)."""
    from melpino_backend.db.models.invoices import Invoice, Payment, Refund

    status_rows = (
        await db.execute(
            select(
                Invoice.status,
                func.count(),
                func.coalesce(func.sum(Invoice.amount_total), 0),
            )
            .where(Invoice.deleted_at.is_(None))
            .group_by(Invoice.status)
        )
    ).all()
    by_status = {
        status: InvoiceStatusBreakdown(count=0, amount_total=Decimal(0))
        for status in _INVOICE_STATUSES
    }
    for status, count, amount_total in status_rows:
        by_status[status] = InvoiceStatusBreakdown(
            count=count, amount_total=_quantize_stat(Decimal(amount_total))
        )

    # Every money query below joins through Invoice and applies the SAME
    # deleted_at.is_(None) predicate as by_status/outstanding -- a
    # soft-deleted invoice's payments/refunds must not keep inflating the
    # collected totals after the invoice itself leaves by_status.
    total_collected = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .where(
                Payment.status.in_(("succeeded", "refunded", "partially_refunded")),
                Invoice.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    total_refunded = (
        await db.execute(
            select(func.coalesce(func.sum(Refund.amount), 0))
            .select_from(Refund)
            .join(Payment, Payment.id == Refund.payment_id)
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .where(Refund.status == "succeeded", Invoice.deleted_at.is_(None))
        )
    ).scalar_one()

    # Lost-dispute clawbacks: only the portion of each lost payment NOT
    # already covered by a succeeded Refund (that part is already
    # subtracted once via total_refunded) -- otherwise a payment that is
    # both refunded and dispute-"lost" would be subtracted twice.
    refunded_by_payment = (
        select(
            Refund.payment_id.label("payment_id"),
            func.sum(Refund.amount).label("refunded"),
        )
        .where(Refund.status == "succeeded")
        .group_by(Refund.payment_id)
        .subquery()
    )
    lost_dispute_amount = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        Payment.amount
                        - func.coalesce(refunded_by_payment.c.refunded, 0)
                    ),
                    0,
                )
            )
            .select_from(Payment)
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .outerjoin(
                refunded_by_payment,
                refunded_by_payment.c.payment_id == Payment.id,
            )
            .where(
                Payment.dispute_status == "lost",
                Payment.status.in_(("succeeded", "refunded", "partially_refunded")),
                Invoice.deleted_at.is_(None),
            )
        )
    ).scalar_one()

    # Net-of-refunds paid-so-far per invoice -- same subquery shape as
    # service.get_paid_so_far, computed in bulk across every open invoice.
    paid_by_invoice = (
        select(
            Payment.invoice_id.label("invoice_id"),
            func.sum(
                Payment.amount - func.coalesce(refunded_by_payment.c.refunded, 0)
            ).label("paid"),
        )
        .select_from(Payment)
        .outerjoin(refunded_by_payment, refunded_by_payment.c.payment_id == Payment.id)
        .where(Payment.status.in_(("succeeded", "partially_refunded")))
        .group_by(Payment.invoice_id)
        .subquery()
    )
    outstanding_rows = (
        await db.execute(
            select(Invoice.amount_total, func.coalesce(paid_by_invoice.c.paid, 0))
            .outerjoin(paid_by_invoice, paid_by_invoice.c.invoice_id == Invoice.id)
            .where(
                Invoice.deleted_at.is_(None), Invoice.status.in_(("sent", "overdue"))
            )
        )
    ).all()
    outstanding = sum(
        (
            max(Decimal(amount_total) - Decimal(paid), Decimal(0))
            for amount_total, paid in outstanding_rows
        ),
        Decimal(0),
    )

    method_rows = (
        await db.execute(
            select(
                Payment.method,
                func.count(),
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .select_from(Payment)
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .where(
                Payment.status.in_(("succeeded", "refunded", "partially_refunded")),
                Invoice.deleted_at.is_(None),
            )
            .group_by(Payment.method)
        )
    ).all()
    by_payment_method = {
        method: PaymentMethodBreakdown(
            count=count, amount=_quantize_stat(Decimal(amount))
        )
        for method, count, amount in method_rows
    }

    dispute_rows = (
        await db.execute(
            select(Payment.dispute_status, func.count())
            .select_from(Payment)
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .where(
                Payment.dispute_status.is_not(None),
                Invoice.deleted_at.is_(None),
            )
            .group_by(Payment.dispute_status)
        )
    ).all()
    dispute_counts: dict[str, int] = {
        status: count for status, count in dispute_rows if status is not None
    }
    disputes = DisputeBreakdown(
        needs_response=dispute_counts.get("needs_response", 0),
        under_review=dispute_counts.get("under_review", 0),
        won=dispute_counts.get("won", 0),
        lost=dispute_counts.get("lost", 0),
    )
    open_disputes = sum(
        dispute_counts.get(status, 0) for status in _OPEN_DISPUTE_STATUSES
    )

    gross_total_collected = Decimal(total_collected)
    net_collected = (
        gross_total_collected - Decimal(total_refunded) - Decimal(lost_dispute_amount)
    )
    _log.info(
        "invoice stats computed",
        extra={
            "total_collected": str(gross_total_collected),
            "outstanding": str(outstanding),
        },
    )
    return InvoiceStats(
        by_status=by_status,
        total_collected=_quantize_stat(gross_total_collected),
        total_refunded=_quantize_stat(Decimal(total_refunded)),
        net_collected=_quantize_stat(net_collected),
        outstanding=_quantize_stat(Decimal(outstanding)),
        by_payment_method=by_payment_method,
        open_disputes=open_disputes,
        disputes=disputes,
    )
