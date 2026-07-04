# 04 -- Booking & Scheduling

Audience: anyone building the booking domain, the public booking flow,
or the scheduler. Read [00-overview.md](00-overview.md),
[02-auth-and-security.md](02-auth-and-security.md) (guest tokens, rate
limits), and [03-database.md](03-database.md) (tables) first. This is
melpino's core domain -- the one substantial thing logand.app has no
equivalent for. Payments are deliberately OUT of this doc's scope
beyond "a booking may reference an invoice" -- see
[05-payments-and-invoicing.md](05-payments-and-invoicing.md).

## Product shape (binding, from the root README)

- Mel teaches **group classes** (two kinds: `law_cert` -- classroom
  firearms-law class with a sim-gun demo; `technique` -- group range
  instruction) and **1:1 private instruction** at a premium.
- Groups are the usual case; private is scheduled from published
  availability slots.
- Bookers are frequently elderly, tech-illiterate, first-time
  computer users. The flow must be completable by someone who has
  never bought anything online: no accounts, no passwords, minimal
  fields, huge targets, plain words, a printable confirmation, and a
  phone-call fallback advertised at every dead end.

## Locked modeling decisions

- **Private 1:1 = a `class_sessions` row with `capacity = 1`** on a
  course of `kind='private'`. Mel publishes the slots he is willing to
  teach; booking one is exactly the group-booking code path with one
  seat. No separate appointments engine, no calendar-negotiation UI.
- **`party_size`**: one booking can hold multiple seats (couples book
  together constantly). Seats consumed = sum of confirmed bookings'
  party_size.
- **Booking is confirmed at creation** (status `confirmed`), not
  pending-until-paid. Payment policy per course: if `deposit > 0` the
  UI takes the deposit right after confirming (see 05), but an unpaid
  booking still holds the seat -- Mel's real-world default is pay in
  person, and losing an elderly customer over a card wall is worse
  than an occasional no-show. Admin can cancel unpaid bookings
  manually. Revisit only with Mel.

## Capacity: the one real race

Two people booking the last seat concurrently must not both succeed.
Same discipline as logand.app's invoice payments (crib
`lock_invoice_for_update`):

```
domain/booking/capacity.py
  async def lock_session_for_booking(db, session_id) -> ClassSession | None
      # SELECT ... FOR UPDATE on the class_sessions row
  async def seats_taken(db, session_id) -> int
      # SUM(party_size) over confirmed bookings, inside the lock
```

`create_booking` transaction: lock session row -> check status is
`published` (and starts_at is in the future) -> seats_taken +
party_size <= capacity else `Err(BookingError.SessionFull)` -> insert
student (dedup, see 03) + booking -> flip session status to `full` if
now at capacity -> commit. Cancellation runs the mirror image inside
the same lock (un-flip `full`, then trigger the waitlist offer).
The row lock serializes only same-session bookings -- different
sessions never contend. Integration test REQUIRED: two concurrent
create_booking calls for a 1-seat session; exactly one succeeds
(see [12-testing-strategy.md](12-testing-strategy.md)).

## Booking lifecycle

```
confirmed --(guest cancel inside window | admin cancel)--> cancelled
confirmed --(admin, after session)--> attended | no_show
```

- Guest cancel allowed until `booking_cancellation_hours` (AppConfig,
  default 24) before `starts_at`; after that
  `Err(CancellationWindowClosed)` and the UI says "call us".
- Admin cancel: any time, any booking, no window.
- `attended`/`no_show` are roster bookkeeping set from the admin tool
  (mockup for now -- the domain functions still exist and are tested).
- Cancelled bookings keep their row (audit); the unique
  (session_id, student_id) constraint must therefore only reject
  duplicates where the existing booking is still `confirmed` -- use a
  partial unique index, not the plain constraint from 03 if a student
  rebooks after cancelling. (Adjust 03's DDL note accordingly in the
  same change -- this is the known wrinkle.)

## Waitlist

When a session is `full`, the public flow offers the waitlist (name +
email + party_size, same attestation). On any seat-freeing event
inside the cancellation transaction: pick the OLDEST waitlist entry
whose party_size fits the freed capacity, send a `waitlist_offer`
email with a booking link that pre-fills the flow, and mark
`notified_at`. Offers are NOT exclusive holds -- no seat reservation
timer, no expiring claims (complexity the audience cannot navigate);
first to complete booking wins, and a notified entry whose seat got
re-taken simply stays on the list. If Mel finds this insufficient,
revisit with him (open question in 14's demo script).

## Public API surface (`api/courses.py`, `api/bookings.py`)

```
GET  /api/courses                     -- active courses w/ card fields
GET  /api/courses/{slug}              -- full course detail
GET  /api/courses/{slug}/sessions     -- published+full future sessions
                                      --   (full shown so UI can offer waitlist)
POST /api/bookings                    -- {session_id, full_name, email,
                                      --  phone?, party_size, attestation:
                                      --  {version, accepted: true},
                                      --  sms_consent, honeypot_field}
                                      -- -> {booking_id, manage_url} + email
POST /api/bookings/waitlist           -- same shape minus payment
GET  /api/bookings/manage/{token}     -- booking detail for the manage page
POST /api/bookings/manage/{token}/cancel
POST /api/bookings/manage/{token}/resend-confirmation
```

Admin CRUD (`api/admin_schedule.py`, `api/admin_students.py`) is
stubbed at scaffold time and validated through the mockup
([14-admin-mockup.md](14-admin-mockup.md)) before being built for
real: course CRUD, session create/publish/cancel (cancelling a session
with confirmed bookings cascades notification emails -- REQUIRED, an
uncommunicated cancelled class is the worst failure this product can
have), roster listing, mark attended/no-show, on-behalf booking
(phone bookings: Mel types what the caller says; skips rate limits,
records `attestation_version = 'admin-phone'`).

## Notifications & the scheduler

Copy logand.app's notifications stack (mailer/templates/notify,
CAN-SPAM footer, opt-out) and its scheduler pattern (same backend
image, sleep-until-04:00-UTC loop, `scripts/scheduler.py`). Melpino's
daily sweep:

1. Send `reminder` emails for bookings whose session starts within
   `reminder_days_before` days -- idempotent via the `reminders_sent`
   unique ledger (see 03), safe to re-run.
2. Flip past `published`/`full` sessions to `completed`.

Transactional sends (confirmation, cancellation, waitlist offer) fire
inline from the domain functions through `notify.py` and are recorded
in the same ledger. Email failures log and never fail the booking
(copy logand's swallow-and-log rule). SMS is out of scope for v1 --
`sms_consent` is captured now (see 06) so reminders can add SMS later
without re-consenting everyone; note this in TODO.md as deferred.

## Frontend booking flow (contract for 07/08's pages)

One route, `/book` (enterable with a course or session preselected),
exactly three steps, each a full screen with one primary action:

1. **Pick a class** -- course cards -> session list (date, time,
   seats left in plain words: "4 of 10 seats open").
2. **Your details** -- full name, email, phone (optional but
   encouraged "so we can call if anything changes"), party size
   stepper, attestation checkbox with the 06 text, sms consent
   checkbox. Zod mirrors backend validation; errors in plain English
   next to the field, never a toast.
3. **Confirm** -- summary in large type -> Book button -> if deposit
   due, the payment step from 05 -> confirmation screen with a BIG
   "print this page" affordance + "we emailed you a link".

Every step shows the phone-call fallback. No step may depend on
hover, drag, or timing. See [09-design-system.md](09-design-system.md)
for the accessibility bar this flow is measured against.

## Test obligations (beyond 02's)

- Unit: state-machine transitions (each illegal transition ->
  correct ErrorSet variant), cancellation-window math around DST.
- Integration: the concurrent last-seat race; waitlist offer on
  cancellation picks oldest-that-fits; reminder ledger idempotency
  (run sweep twice, one email); session cancel notifies every
  confirmed booking.
- System: full guest journey -- browse, book, receive (fake-SMTP)
  confirmation, manage-link cancel, waitlist promotion.

## What NOT to put here

- Token mechanics/rate limits -> [02-auth-and-security.md](02-auth-and-security.md)
- Deposits/payments -> [05-payments-and-invoicing.md](05-payments-and-invoicing.md)
- Attestation text -> [06-waivers-and-legal.md](06-waivers-and-legal.md)
- Screen visuals -> [09-design-system.md](09-design-system.md)
