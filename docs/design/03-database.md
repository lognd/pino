# 03 -- Database

Audience: anyone writing SQLAlchemy models or Alembic migrations. Read
[00-overview.md](00-overview.md) first. PostgreSQL is locked. Mirror
logand.app's `db/` conventions: async engine in `db/base.py`, one
model module per table group, uuid PKs, `created_at`/`updated_at`
timestamptz columns, soft-delete only where called out, CHECK
constraints for enums (portable + introspectable), Alembic migrations
hand-reviewed (never trust autogenerate blindly).

## Tables

Copy from logand.app unchanged in shape: `users` (add
`role text check (role in ('admin','staff'))` -- no customer role
here), `sessions` (auth sessions), `password_reset_tokens`,
`admin_audit_log`, `email_opt_out`. Then melpino's own:

```
courses                      -- the catalog: what Mel teaches
  id             uuid pk
  slug           text unique not null      -- URL identity, e.g. 'ccw-cert'
  kind           text not null check (kind in
                 ('law_cert',     -- classroom law class + sim-gun demo
                  'technique',    -- group range/technique class
                  'private'))     -- 1:1 premium instruction
  title          text not null
  summary        text not null              -- card-length copy
  description    text not null              -- full page copy (markdown)
  price          numeric(12,2) not null     -- per seat
  deposit        numeric(12,2) not null default 0  -- 0 = pay in full/in person
  duration_min   int not null
  default_capacity int not null             -- seats when a session is created
  is_active      boolean not null default true  -- retired courses keep history
  created_at / updated_at

class_sessions               -- a scheduled occurrence of a course
  id             uuid pk
  course_id      uuid fk -> courses, on delete restrict
  starts_at      timestamptz not null
  ends_at        timestamptz not null
  location_name  text not null              -- 'SAMPLE Range, Clearwater'
  location_addr  text not null default ''
  capacity       int not null check (capacity >= 1)
  status         text not null default 'draft' check (status in
                 ('draft','published','full','completed','cancelled'))
  notes          text not null default ''   -- admin-only
  created_at / updated_at
  -- 'full' is DERIVED but stored: flipping it inside the same
  -- booking transaction lets the public listing query stay a single
  -- indexed read with no COUNT(*) join. domain/booking/capacity.py
  -- owns the transition in both directions (booking + cancellation).
  -- Private (1:1) availability is modeled as class_sessions rows with
  -- capacity=1 on a course of kind='private' -- no separate
  -- appointments table (locked decision, see 04).

students                     -- a person who has ever booked/attended
  id             uuid pk
  full_name      text not null
  email          text not null              -- NOT unique: households share
  phone          text not null default ''
  notes          text not null default ''   -- admin-only
  created_at / updated_at
  -- dedup on (lower(email), lower(full_name)) at booking time in
  -- domain/students/service.py: match -> reuse row, else create.
  -- No DOB/SSN/license numbers, ever -- see 02 and 06.

bookings
  id                 uuid pk
  session_id         uuid fk -> class_sessions, on delete restrict
  student_id         uuid fk -> students, on delete restrict
  party_size         int not null default 1 check (party_size >= 1)
  status             text not null default 'confirmed' check (status in
                     ('confirmed','cancelled','attended','no_show'))
  manage_token_hash  text unique not null       -- SHA-256, see 02
  attested_at        timestamptz not null        -- eligibility checkbox, see 06
  attestation_version text not null              -- which text they agreed to
  sms_consent        boolean not null default false  -- TCPA, see 06
  invoice_id         uuid fk -> invoices, null   -- set when payment involved
  cancelled_at       timestamptz null
  created_at / updated_at
  unique (session_id, student_id)                -- DuplicateBooking backstop

waitlist_entries
  id             uuid pk
  session_id     uuid fk -> class_sessions, on delete cascade
  student_id     uuid fk -> students, on delete cascade
  party_size     int not null default 1
  notified_at    timestamptz null   -- when a freed seat was offered
  created_at
  unique (session_id, student_id)

waivers
  id             uuid pk
  student_id     uuid fk -> students, on delete restrict
  session_id     uuid fk -> class_sessions, null  -- optional link
  template_version text not null
  file_key       text not null      -- storage key, see 13
  content_type   text not null      -- allowlist png/jpeg/webp/pdf
  file_hash      text not null
  uploaded_by    uuid fk -> users, on delete set null
  created_at

invoices / invoice_line_items / payments / payment_proofs
  -- copy logand.app's 04-invoices.md schema verbatim (numeric(12,2)
  -- money, status CHECKs, partial unique indexes on
  -- stripe_payment_intent_id / paypal_order_id, paid_at set once)
  -- with ONE change: invoices.customer_id becomes
  -- invoices.student_id fk -> students (melpino has no customer
  -- accounts; pay-by-link uses the booking manage token or an
  -- invoice-scoped token, see 05).

reminders_sent               -- idempotency ledger for the scheduler
  id             uuid pk
  booking_id     uuid fk -> bookings, on delete cascade
  kind           text not null check (kind in ('confirmation',
                 'reminder','waitlist_offer','cancellation'))
  sent_at        timestamptz not null
  unique (booking_id, kind)   -- a reminder fires at most once per kind
```

## Indexes worth declaring up front

- `class_sessions (status, starts_at)` -- the public listing query.
- `bookings (session_id) where status = 'confirmed'` -- roster +
  capacity checks.
- `bookings (manage_token_hash)` -- unique already covers it.
- `students (lower(email))` -- dedup lookup.

## Migration rules (copy logand.app's discipline)

- `0000_initial_schema.py` creates everything above in one migration.
- Every migration hand-reviewed; CHECK constraints and partial unique
  indexes are exactly the things autogenerate gets wrong.
- Integration test: fresh-DB upgrade to head + downgrade round-trip
  (see [12-testing-strategy.md](12-testing-strategy.md)).
- `alembic.ini` at backend/ root, `script_location` under
  `src/melpino_backend/db/migrations` -- and remember logand's
  Dockerfile lesson: COPY alembic.ini into the image or the deployed
  stack silently never migrates.

## What NOT to put here

- Booking state transitions/locking -> [04-booking-and-scheduling.md](04-booking-and-scheduling.md)
- Payment semantics -> [05-payments-and-invoicing.md](05-payments-and-invoicing.md)
- Waiver handling rules -> [06-waivers-and-legal.md](06-waivers-and-legal.md)
