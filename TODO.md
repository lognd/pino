# TODO -- melpino master checklist

Live checklist; drive to zero. Mark items `[x]` in the same change
that completes them. If scope gets cut, strike it and say why -- never
silently drop a line. Build order = phase order; do not start a phase
with the previous phase's gate unmet, except P1 (frontend-only) which
may run in parallel with P2/P3.

Conventions for every phase: stubs carry `# TODO(impl)` markers; every
public symbol gets a docstring; tests (unit/integration/system) are
stubbed with skip markers alongside the code they will test
(docs/design/12). Read the design doc referenced by each phase BEFORE
implementing; docs win over guesses.

## P0 -- Scaffold (DONE when `make check` passes on stubs)

- [x] Repo bootstrap: git, remote (github.com/lognd/pino), MIT, docs set
- [x] backend/ scaffold per docs/design/01 (stubs, pyproject, Makefile,
      Dockerfile, alembic skeleton, env example, test skeletons)
- [x] frontend/ scaffold per docs/design/07 (configs, route stubs,
      hero/ module stubs, tokens.css, brand.ts, content/mock.ts,
      mocks/, test skeletons)
- [x] root: Makefile, compose x3, Caddyfile, CI + deploy workflows,
      ops/ stubs, docs/README.md + docs/secrets.md + docs/deployment.md
- [x] `make check` green per subproject (backend ruff/ty pass,
      frontend typecheck/lint pass; test suites all-skip by design)
- [x] README.md links updated; first push to origin

## P1 -- Landing page + hero prototype (docs/design/08, 09, 10)

- [x] tokens.css + Tailwind theme wired; Barlow/Barlow Condensed via
      @fontsource; base components (BigButton, Field, SampleBanner...)
- [ ] Wordmark SVG asset: trace/redraw the MEL PINO lockup mockup
      (red MEL / white PINO, heavy condensed italic), pre-split into
      id'd shards (08). HUMAN INPUT: confirm lockup fidelity w/ Logan.
      (Placeholder skewed-text lockup + 16 clip-shard triangles are in;
      swap keeps Wordmark.tsx's shard API.)
- [x] /hero-lab dev route; useScrub state machine (+unit tests)
- [x] SimulatedSource (canvas, seeded, pure-in-progress) to budget
      (gzip chunk size still to be confirmed by a real vite build)
- [x] Wordmark shatter tied to progress (+purity unit test; envelope
      rule resolved + recorded in docs/design/08)
- [x] Degradation ladder rungs 1-4 + poster asset (rung-4 log call
      TODO until lib/logging.ts is implemented)
- [x] Landing page assembly: hero + course cards + credibility strip +
      CTA band (mock content, SAMPLE-marked)
- [x] Courses/About/Contact/Legal pages from content/mock.ts
- [ ] Prerender step; JSON-LD; sitemap/robots/llms.txt
- [ ] Playwright: landing/axe/reduced-motion/SEO obligations (12)
- [ ] GATE: axe zero critical/serious on all public pages

## P2 -- Backend skeleton (docs/design/01, 02, 03)

- [ ] logging/ module (refs/logging.md + logand's json/rotation extras)
- [ ] AppConfig + App + asgi + __main__ (copy patterns, melpino fields)
- [ ] errors.py ErrorSets + api/errors.py status map (fail-fast check)
- [ ] db/base.py + models + 0000_initial_schema migration (03)
- [ ] auth/: passwords, sessions, csrf, rate_limit (copy logand),
      booking_tokens (new, per 02)
- [ ] api/health + api/auth + api/config_public
- [ ] Admin seed lifespan hook; docker-compose.dev.yml verified
- [ ] Migration round-trip integration test green
- [ ] GATE: backend `make check` green with real (non-skip) P2 tests

## P3 -- Booking domain (docs/design/04; THE core)

- [ ] domain/courses + domain/students (dedup) + services
- [ ] domain/booking: capacity.py (FOR UPDATE), create/cancel/waitlist
- [ ] Concurrent last-seat race integration test (flagship) green
- [ ] api/courses + api/bookings (+honeypot, attestation, rate limits)
- [ ] notifications/ (copy logand mailer/templates/notify + fake_smtp)
- [ ] confirmation/cancel/waitlist-offer emails + reminders_sent ledger
- [ ] scripts/scheduler.py sweep (reminders + completed flips)
- [ ] Frontend: 3-step /book flow + /booking/{token} manage page wired
      to real API (guest journey Playwright test green)
- [ ] GATE: full guest system journey green in compose test stack

## P4 -- Payments (docs/design/05)

- [ ] Copy+adapt: domain/invoices (service, refunds, stats, pdf/),
      domain/payments/providers/paypal.py, api/webhooks.py,
      testing/fake_stripe.py + fake_paypal.py
- [ ] Invoice pay-tokens (pay_token_hash) + /pay/{token} page
- [ ] Deposit auto-invoice on booking (04/05 contract)
- [ ] Manual payment recording endpoint (admin)
- [ ] melpinoinvoice.cls letterhead w/ business_legal_name
- [ ] Payment idempotency/tamper/race tests copied + green
- [ ] GATE: deposit journey green end-to-end vs fake-stripe

## P5 -- Waivers + legal surface (docs/design/06)

- [ ] domain/storage (copy + namespace-privacy guard) + moto tests
- [ ] domain/waivers + api/waivers upload/list/stream
- [ ] Legal pages content pass; attestation text versioned; consent
      capture wired. HUMAN INPUT: resolve every VERIFY item in 06
      with Mel/counsel before real bookings.
- [ ] GATE: privacy guard test + waiver round-trip green

## P6 -- Admin mockup (docs/design/14; anytime after P1)

- [ ] MSW browser/handlers/data + fake gate + MOCKUP banner
- [ ] 8 mockup screens per 14's route list
- [ ] Playwright mockup smoke test
- [ ] HUMAN INPUT: demo to Mel; record per-screen answers in 14;
      then re-scope P7+ admin build accordingly

## P7 -- Deploy (docs/design/11)

- [ ] Dockerfile + compose prod stack boots locally end-to-end
- [ ] CI system-tests job green in GitHub Actions
- [ ] HUMAN INPUT: domain decision, Hetzner VPS, Cloudflare DNS, R2
      buckets (media + backup), GitHub secrets
- [ ] setup-vps.sh + deploy.yml first successful run
- [ ] Backup + tested restore runbook (BLOCKS first real booking)
- [ ] docs/deployment.md + docs/secrets.md + docs/usage.md finalized

## Deferred (explicitly, not dropped)

- SMS reminders (consent already captured; pick provider later) -- 04
- Waiver e-signing (DocuSign-ish) -- 06
- Recurring invoices for standing private lessons -- 05
- Light theme -- 09
- Real hero footage VideoSource activation -- 08 (interface ready)
- Staff-role restrictions beyond enum + guards -- 02

## Aggregated "ask Mel" list

Domain name; real bio/photos/prices; hero footage plans; waitlist
mechanics sufficiency; group-vs-individual invoicing habits; deposit
amounts per course; legal VERIFY items (06); testimonials permission.
