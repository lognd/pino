# 05 -- Payments & Invoicing

Audience: anyone building payments, deposits, or invoices. Read
[00-overview.md](00-overview.md) and logand.app's
`docs/design/04-invoices.md` FIRST -- that doc plus its implementation
(`domain/invoices/`, `domain/payments/`, `api/webhooks.py`,
`api/invoices_public.py`, `testing/fake_stripe.py`/`fake_paypal.py`)
is the normative reference. This doc records only what melpino
changes. Everything not mentioned here is "copy logand.app".

## What is copied unchanged

- Stripe primary (PaymentIntents; card data never touches our server),
  PayPal optional (Orders v2, gracefully 503 when unconfigured),
  Zelle/in-person as manually-recorded payments, refunds, payment
  proofs, the `GET /api/invoices/payment-methods` availability
  endpoint pattern.
- Row-lock discipline: every read-then-act invoice operation locks
  the row (`lock_invoice_for_update`); partial unique indexes on
  provider ids as the DB backstop; webhook handlers idempotent under
  at-least-once delivery.
- LaTeX PDF invoices (`domain/invoices/pdf/`): copy the .cls +
  .tex.jinja + renderer chokepoint-escaping pipeline; re-letterhead
  with `business_legal_name` (NEVER a hardcoded name -- see 00) and
  melpino's wordmark treatment per
  [09-design-system.md](09-design-system.md); rename the .cls file
  `melpinoinvoice.cls`.
- Real-protocol test doubles (fake_stripe/fake_paypal/fake_smtp) and
  the `*_api_base=None means real host` config convention.
- Recurring invoices: copy the mechanism (Mel may run a recurring
  private-lesson arrangement) but it is LOW priority -- stub + TODO.

## What changes for melpino

1. **No customer accounts.** logand's customer-facing invoice surface
   sits behind customer login; melpino has none. Pay-by-link instead:
   an invoice email carries `/pay/{invoice_token}` -- a 256-bit
   invoice-scoped token, SHA-256-hashed on the invoice row
   (`pay_token_hash` column, add to 03's copied schema), same
   mint/lookup/404 semantics as booking manage tokens
   ([02-auth-and-security.md](02-auth-and-security.md)). The pay page
   shows amount due + the configured methods. A booking's manage page
   links straight to its invoice's pay page when a balance is due.
2. **Deposits.** `courses.deposit > 0` means the booking flow offers
   (not forces -- see 04's locked decision) paying the deposit right
   after confirmation. Mechanics: create_booking with a deposit course
   auto-creates an invoice (line item "Deposit -- {course.title}",
   amount = deposit * party_size) linked via `bookings.invoice_id`;
   the confirmation screen embeds that invoice's pay flow. The
   remainder is settled in person or via a second admin-issued
   invoice. Partial-payment accounting: copy logand's
   `get_paid_so_far` / `settle_invoice_if_paid` exactly.
3. **Per-class group invoicing.** Admin can generate one invoice per
   booking for a whole session in one action ("invoice everyone still
   unpaid for Saturday's class"). Thin loop over the copied
   create_invoice -- admin endpoint
   `POST /api/admin/sessions/{id}/invoice-unpaid`. Validate demand in
   the mockup before building
   ([14-admin-mockup.md](14-admin-mockup.md)).
4. **In-person is the headline method, not the fallback.** The admin
   record-manual-payment flow (Zelle/cash/card-reader-outside-the-
   system) is a first-class screen in the mockup; the API is logand's
   `payments/manual` endpoint unchanged.

## Config

Same env names as logand (`PAYMENT_PROCESSOR_SECRET`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_API_BASE`, `PAYPAL_*`,
`ZELLE_HANDLE`) -- see [01-backend-architecture.md](01-backend-architecture.md)
for the full AppConfig field list and `docs/secrets.md` for rotation.

## Test obligations

Copy logand's payment test surface (idempotent webhooks, amount
tampering, concurrency double-pay race, refunds, manual payments,
provider-unconfigured 503s) plus melpino-specific: invoice pay-token
isolation (token cannot read another invoice), deposit invoice
auto-creation math (party_size multiplication), invoice-everyone
endpoint skips already-paid bookings. See
[12-testing-strategy.md](12-testing-strategy.md).

## What NOT to put here

- Booking lifecycle -> [04-booking-and-scheduling.md](04-booking-and-scheduling.md)
- Token mechanics -> [02-auth-and-security.md](02-auth-and-security.md)
- Schema -> [03-database.md](03-database.md)
