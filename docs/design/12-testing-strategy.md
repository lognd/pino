# 12 -- Testing Strategy

Audience: every agent building anything. Hard requirement: **every
component, backend and frontend, carries unit, integration, and
system tests.** Normative reference: logand.app's
`docs/design/12-testing-strategy.md` -- its layer definitions
(unit = no I/O; integration = real test Postgres/Redis, no mocking
the boundary under test; system = black-box HTTP/browser), its
tooling (pytest -n auto, testcontainers or compose Postgres,
transaction-per-test rollback; Vitest + RTL; Playwright), and its
coverage lessons (the `concurrency = ["greenlet"]` false-negative
note) all apply verbatim. This doc lists only melpino's specific
obligations.

## Backend obligations by feature

- Auth/security ([02](02-auth-and-security.md)): logand's set
  (session expiry, CSRF, Argon2id, kill-all-sessions) PLUS
  manage-token round-trip/expiry/404-shape, honeypot rejection,
  booking-create rate limit 429, cross-booking token isolation,
  tokens-never-logged grep.
- Database ([03](03-database.md)): migration up/down round-trip on
  fresh Postgres; partial-unique rebooking-after-cancel case.
- Booking ([04](04-booking-and-scheduling.md)): **the concurrent
  last-seat race is the flagship integration test of this repo** --
  two simultaneous `create_booking` calls, 1 seat, exactly one Ok;
  state-machine unit tests per illegal transition; waitlist
  oldest-that-fits selection; reminder ledger idempotency (sweep
  twice -> one email via fake_smtp); session-cancel notifies every
  confirmed booking; DST-boundary cancellation-window math.
- Payments ([05](05-payments-and-invoicing.md)): copy logand's suite
  (webhook idempotency, amount tampering, double-pay race, refunds,
  manual payments, unconfigured-provider 503) + pay-token isolation,
  deposit invoice math (party_size multiplication), invoice-unpaid
  bulk endpoint skips paid.
- Waivers ([06](06-waivers-and-legal.md)): content-type allowlist,
  hash-matches-bytes, booking rejected without attestation.

## Frontend obligations

- Unit: booking-flow field validation (zod mirrors backend), scrub
  easing/idle state machine + shard purity
  ([08](08-landing-hero.md)), brand.ts interpolation.
- Integration: api/ modules against the real test backend (CSRF
  attach on admin mutations, 429 countdown surfacing, `code`-field
  branching).
- System (Playwright, against docker-compose.test.yml):
  - Guest journey: browse courses -> book (attestation checked) ->
    fake-SMTP confirmation link -> manage page -> cancel.
  - Full-session path: waitlist join -> admin/API cancel frees seat
    -> offer email.
  - Deposit path: book deposit course -> Stripe test payment via
    fake-stripe -> invoice shows paid.
  - Admin mockup: /admin fake gate + MOCKUP banner
    ([14](14-admin-mockup.md)).
  - Hero: reduced-motion poster rung; H1 present pre-hydration.
  - **axe scan on every public page: zero critical/serious** -- the
    elderly-first gate ([09](09-design-system.md)).
  - SEO: every public route serves non-empty meaningful HTML +
    valid JSON-LD ([10](10-seo-and-content.md)).

## Repo-policy checks (cheap greps, run in CI as a `policy` step)

- No hardcoded business name outside the two sanctioned files + docs
  + wordmark asset (see 00).
- No hardcoded domain outside Caddyfile's env default.
- Every public-copy string originates in `content/mock.ts` (spot
  check: grep for quoted sentences in route components).
- ASCII-only: `grep -rP '[^\x00-\x7F]' --exclude-dir={node_modules,
  .git,dist,.venv}` returns nothing.

## Gates

`make check` per subproject = CI PR gate; combined system-tests job
required before merge to main; deploy blocked on all green (see
[11-deployment.md](11-deployment.md)). No component is "done" without
its three layers -- stubs get their test files stubbed alongside them
with `pytest.mark.skip(reason="TODO(impl): ...")`/`test.todo` so the
obligation is visible in the suite, not in someone's memory.
