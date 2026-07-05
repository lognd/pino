# 14 -- Admin / Business App (Mockup)

Audience: anyone building the admin SPA mockup under
`frontend/src/app/routes/admin/` and its Mock Service Worker
(`frontend/src/mocks/`). Read [07-frontend-architecture.md](07-frontend-architecture.md)
for the app shell and [09-design-system.md](09-design-system.md) for
visuals first.

## Why this exists (and why it is only a mockup)

Mel runs the whole training business out of his head, a phone, and a
notebook. We do NOT yet know which of scheduling, rosters, invoicing,
certs, waivers, and inventory he actually wants software for -- and
guessing wrong means building a real backend for a feature he will never
open. So the admin app ships first as a FRONTEND-ONLY MOCKUP: clickable
screens, plausible fake data, zero real backend. Its entire job is to
put realistic screens in front of Mel, let him click around, and pull
out of him what he needs. Every screen is a discovery prompt, not a
committed feature.

The one hard engineering rule that makes this cheap instead of throwaway:
**the mockup talks to the exact API surface the real backend will later
expose.** All fake data is served by Mock Service Worker (MSW) handlers
that intercept the same HTTP paths the real backend will answer (e.g.
`GET /api/admin/sessions`). When a screen graduates to real, we delete
its MSW handler and the real endpoint answers the same request the
component was already making. The React component does not change. That
contract is the whole point of this doc; everything below serves it.

## What this is NOT

- Not a real backend. No database, no auth service, no persistence
  across reload beyond what MSW holds in memory. Real booking lives in
  [04-booking-and-scheduling.md](04-booking-and-scheduling.md); real
  payments in [05-payments-and-invoicing.md](05-payments-and-invoicing.md).
- Not a committed feature list. The scope below is imagined and WILL be
  pared down with Mel. Do not treat any screen here as a promise.
- Not the public site. This is the `/admin` SPA only. The marketing site
  and the customer-facing booking flow are separate.

## Scope (imagined -- to be pared down with Mel)

Everything here is a candidate, not a commitment. Grouped roughly the way
Mel talks about the business:

- **Scheduling** -- class sessions with a date/time/location, seat
  capacity, a waitlist when full, and a calendar view Mel can scan for
  the month. Both group classes and premium 1-on-1 sessions
  (see the README "Current Answers").
- **Rosters and records** -- the student list, who is enrolled in which
  session, course-completion marking, certificate issuance, and storage
  of signed waivers per student.
- **Invoicing** -- per-student and per-class invoices, deposits,
  paid/unpaid state, and recording an in-person payment (cash, card
  reader, Zelle) after the fact. Online payment providers (Stripe,
  PayPal, Zelle) are a real-backend concern, not mocked here beyond the
  "record a payment" flow.
- **Utilities** -- range/ammo inventory, an income report, and reminder
  emails/SMS for upcoming sessions.

Assume most of these survive the Mel review in some form, but assume
none of them survive unchanged.

## Mockup mechanics

### Route gating

The admin SPA mounts at `/admin` behind a login gate at `/admin/login`.
**Auth itself has graduated** (see "Graduation path" below): outside the
`VITE_USE_MOCKS=true` build, `/api/auth/login`, `/api/auth/me`, and
`/api/auth/logout` bypass MSW and hit the real backend
(`api/auth.py` / `domain/auth/service.py`, see
[02-auth-and-security.md](02-auth-and-security.md)) -- a real admin
account (seeded via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) is
required. The `VITE_USE_MOCKS=true` build (used by `npm run dev:mock`
and the Playwright "admin" system-test project, which has no live
backend) keeps the original fake sessionStorage gate (any email +
`MOCK_LOGIN_PASSWORD`) so those still work standalone. Every other
`/admin/*` screen below this point is still a genuine MSW mockup --
AdminGuard's real `/api/auth/me` check is the sole gate they rely on.

### All data comes from MSW

There is no `fetch` to a live server anywhere in the mockup. Every
network call the admin components make is intercepted by Mock Service
Worker. MSW lives in three files, mirroring the sibling repo's layout
exactly:

- `frontend/src/mocks/browser.ts` -- sets up the MSW worker
  (`setupWorker(...handlers)`) and is started from the app entry point
  (`main.tsx`) only in the mockup build / dev mode, never in a real
  production build.
- `frontend/src/mocks/handlers.ts` -- the request handlers, one per API
  path (see contract below).
- `frontend/src/mocks/data.ts` -- the fake datasets the handlers read
  from and write to (see Fake data conventions).

### The path-mirroring contract (the important part)

Every MSW handler MUST intercept the **exact HTTP method and path the
real backend will later serve** -- the same URL the component would hit
against production. Concretely:

- Handlers are written against real paths under `/api/admin/...`, e.g.
  `GET /api/admin/sessions`, `GET /api/admin/sessions/:id`,
  `GET /api/admin/students`, `POST /api/admin/invoices/:id/payments`.
- The component uses the normal API client and does NOT know MSW exists.
  It calls `apiClient.get("/api/admin/sessions")` whether the answer
  comes from MSW or a real server.
- The shape of each mock JSON response is the shape the real endpoint
  will return. When these shapes are decided, they are recorded in the
  owning backend design doc (04, 05, ...), and the mock mirrors that doc
  -- the doc is the source of truth, the mock follows it.

The payoff: **graduating a screen from mockup to real means deleting its
handler from `handlers.ts` and nothing else.** No component edit, no URL
change, no client change. If graduating a screen requires touching the
React component, the contract was violated and that is a bug to fix
before shipping the mockup.

Keep the handler file organized so one screen's handlers can be removed
as a clean block -- group handlers by screen/resource with a comment
header per group naming the screen and the owning backend doc.

## Fake data conventions

- **One home.** Every fake dataset lives in
  `frontend/src/mocks/data.ts`. Handlers import from it; components never
  import fake data directly. No fake data is inlined in a component or a
  handler.
- **Unmistakably fake.** Every sample record is labeled as sample: names
  like `"SAMPLE Jane Doe"` and `"SAMPLE John Q. Public"`, phone numbers
  in the reserved `555-01xx` range, emails at `@example.com`, obviously
  fake addresses. Nobody skimming a screen should mistake a sample
  student for a real one.
- **Persistent visible banner.** Every mockup screen renders a fixed,
  always-visible banner reading exactly `MOCKUP -- SAMPLE DATA` (a
  single shared `MockupBanner` component, high-contrast per the brand's
  black/red, hard-edged, no rounded corners). It does not scroll away
  and cannot be dismissed. This is the guardrail that stops Mel from
  ever believing the mockup is a live system managing real students.
- **In-memory mutation is fine.** Handlers may mutate the `data.ts`
  arrays so a "record payment" or "add to waitlist" action visibly
  updates the screen within a session. State resetting on reload is
  acceptable and even desirable -- it reinforces that nothing is real.

## Route list (mockup SPA)

All under `/admin`, all behind the fake gate, all showing the banner.
Suggested set (~8 screens; expect Mel to cut some):

- **Dashboard** (`/admin`) -- landing overview: next few upcoming
  sessions, seats filled vs. capacity, a count of unpaid invoices, and
  quick links into the other screens. Purpose: answer "what does Mel
  want to see first thing in the morning." Interactions: click a session
  to jump to its detail; click an invoice count to jump to Invoices.
- **Calendar / Schedule** (`/admin/schedule`) -- month/week calendar of
  class sessions, each block showing title, time, and seats filled.
  Purpose: does Mel think in a calendar, or a list. Interactions: click
  a day to see its sessions; click a session block to open Session
  detail; a "new session" button opens a create form (mock-only).
- **Session detail w/ roster** (`/admin/schedule/:sessionId`) -- one
  session: date/time/location, capacity, the enrolled roster, and the
  waitlist. Purpose: is a per-session roster how Mel wants to run a
  class day. Interactions: mark a student present/completed, move a
  waitlisted student into an open seat, issue a cert, open a student.
- **Students** (`/admin/students`) -- searchable list of students with
  course history and completion status; a student drill-down shows their
  sessions, certs, and waiver status. Purpose: does Mel keep people
  ("the student") or events ("the class") at the center. Interactions:
  search/filter, open a student, jump to a related session or invoice.
- **Invoices** (`/admin/invoices`) -- list of invoices with amount,
  paid/unpaid/partial state, and deposit status; filter by state. An
  invoice drill-down shows line items and payment history. Purpose: per
  student or per class -- which does Mel actually bill. Interactions:
  filter by unpaid, open an invoice, launch the record-payment flow.
- **Record payment** (`/admin/invoices/:invoiceId/pay`) -- the in-person
  payment capture flow: pick method (cash / card reader / Zelle / other),
  enter amount, confirm, and see the invoice flip toward paid. Purpose:
  confirm the in-person recording flow matches how Mel takes money at the
  range. Interactions: a confirm step before the payment "posts"
  (mock-only) and updates the invoice.
- **Waivers** (`/admin/waivers`) -- signed-waiver storage: per student,
  which waiver they signed and when, with a mock "view document" that
  opens a sample PDF placeholder. Purpose: does Mel want us holding
  waivers at all, or does that stay on paper. Interactions: filter to
  students missing a waiver; open a sample document.
- **Settings** (`/admin/settings`) -- business identity and config:
  business name (`"Mel Pino, LLC"`, short name `"Mel Pino"`) surfaced as
  an editable field to prove it is configurable, default class capacity,
  notification toggles. Purpose: what does Mel expect to be able to
  change himself. Interactions: edit fields (mock-only, non-persisting).

Optional stretch screens if Mel asks: **Inventory** (range/ammo counts)
and **Reports** (income summary). Add them only if the demo surfaces the
need.

## Graduation path (mockup -> real feature)

No mockup screen may silently become "real." A screen graduates only by
this ordered checklist, and the first item gates the rest:

1. **Backend design doc exists first.** The screen's real domain must be
   specified in its owning design doc (booking in
   [04-booking-and-scheduling.md](04-booking-and-scheduling.md), payments
   in [05-payments-and-invoicing.md](05-payments-and-invoicing.md), etc.),
   including the exact request/response shapes the screen already assumes.
   If that doc does not exist, the screen stays a mockup. This is the
   hard rule: **a real endpoint never appears without its design doc.**
2. **Implement the backend endpoints** to match the shapes the mock has
   been serving (the doc from step 1 is the contract).
3. **Delete the screen's MSW handler(s)** from `handlers.ts` (the
   grouped block for that screen) and remove any now-unused fake data
   from `data.ts`. The component is untouched.
4. **Remove the mockup banner** for that screen (or the whole app, once
   the last screen graduates) and wire the fake gate over to real auth.
5. **Add integration/system tests** against the real endpoint per
   [12-testing-strategy.md](12-testing-strategy.md); the screen is not
   "real" until those pass.

Screens graduate one at a time. A half-graduated app (some real, some
still MSW) is a normal, expected intermediate state -- the banner and
the fake gate simply narrow to the still-mocked screens.

## Open questions for Mel (drive the demo)

Each screen exists to extract a decision. Ask these while Mel clicks:

- **Schedule / Session** -- Do you want a calendar, or just a list of
  upcoming classes? Do classes have fixed seat limits? Do you ever run a
  waitlist, or do you just tell people "next time"? Is a 1-on-1 just a
  session with capacity 1, or a different thing entirely?
- **Students** -- Do you think about students, or about classes? Do you
  want to look one person up and see their whole history, or is that
  more than you need? Do you track who completed vs. who just attended?
- **Certs** -- Do you issue a certificate? Should the system generate it,
  or do you hand it out in person and just want it recorded?
- **Invoices** -- Do you bill each student, or bill a whole class at
  once? Do you take deposits to hold a seat? How often is someone
  "partly paid"?
- **Record payment** -- How do you actually take money at the range --
  cash, a card reader, Zelle, a mix? Do you record it on the spot or
  after?
- **Waivers** -- Do you want us to hold signed waivers digitally, or does
  that stay on paper? Does someone need a waiver on file before they can
  book?
- **Settings** -- What do you expect to change yourself without calling
  us? Is "Mel Pino, LLC" the right name to show everywhere?
- **Utilities** -- Do you want to track ammo/range inventory here at all?
  Do you want automatic class reminders by text or email, and to whom?

Record the answers back into the owning design docs, not into this file.

## Test obligations

Per [12-testing-strategy.md](12-testing-strategy.md):

- **Unit tests (mockup components).** Each mockup screen has a unit test
  that renders it with MSW active and asserts it displays the sample
  data from `data.ts` (e.g. the Students screen shows `SAMPLE Jane Doe`).
  These run against MSW, exercising the same request path the real
  backend will serve, so they keep working across graduation.
- **The banner is asserted.** At least one test asserts every mockup
  screen renders the `MOCKUP -- SAMPLE DATA` banner -- this guardrail is
  load-bearing and must not be droppable by accident.
- **Playwright system test.** One end-to-end test that the `/admin`
  mockup loads only after passing the fake gate, and that a landed admin
  screen shows the banner. It should also assert an unauthenticated visit
  to a deep `/admin/...` route is bounced back to the gate.

## What NOT to put here

- **Real booking/scheduling domain** -- sessions, capacity, waitlist
  rules as actual backend logic: [04-booking-and-scheduling.md](04-booking-and-scheduling.md).
- **Real payments and invoicing** -- Stripe/PayPal/Zelle integration,
  invoice generation, payment state machine:
  [05-payments-and-invoicing.md](05-payments-and-invoicing.md).
- **App shell, routing, API client, auth wiring** -- how `/admin` mounts
  and how the real auth gate works:
  [07-frontend-architecture.md](07-frontend-architecture.md).
- **Visual language** -- the black/red hard-edged type scale, palette,
  and components the banner and screens are built from:
  [09-design-system.md](09-design-system.md).

This doc owns only the mockup: the MSW contract, the fake-data
conventions, the screen list as a discovery tool, and the graduation
checklist. Anything that outlives the mockup belongs in one of the docs
above.
</content>
</invoke>

## Addendum (2026-07-05): calendar, logs, and billing metrics

Three owner-requested screens/tiles, mockup-first like everything else
here (MSW path-mirroring; the backend endpoints already exist):

- **/admin/calendar** -- month-grid widget of sessions (chips show
  time, course, seats filled; click-through to session detail) plus
  the SYNC TO GOOGLE CALENDAR box: the subscribable ICS feed URL
  (backend api/calendar.py, key-gated via CALENDAR_FEED_KEY) with a
  copy button and plain-words subscribe instructions. Grid math is
  pure (frontend lib/calendarGrid.ts) and buckets by LOCAL day.
- **/admin/logs** -- logand.app's admin logs portal pattern: live
  JSON-log tail with a level filter, rotated-file downloads
  (backend api/admin_logs.py), and the current browser session's
  client-side log (lib/logging.ts) with an export button.
- **Dashboard "Bookings by source" tile** -- web vs manually-entered
  booking counts and seat totals, all-time + current month (backend
  api/admin_metrics.py over bookings.source). These numbers are the
  owner's site-fee billing data: the split must stay trustworthy,
  which is why source is stamped server-side only (public API cannot
  set it) and cancelled bookings are excluded.

Public side of the same round: confirmed bookings' manage pages offer
"Add to Google Calendar" and a .ics download (docs/design/04's manage
surface; backend serves both from the manage token).
