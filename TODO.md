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
- [x] Prerender step; JSON-LD; sitemap/robots/llms.txt
- [x] Playwright: landing/axe/reduced-motion/SEO obligations (12)
      (found + fixed: red-on-surface contrast token, hydration broken
      by throwing logging stub, legal route shadowing)
- [x] GATE: axe zero critical/serious on all public pages
      (unconditional assertion, no allowlist)

## P2 -- Backend skeleton (docs/design/01, 02, 03)

- [x] logging/ module (refs/logging.md + logand's json/rotation extras)
- [x] AppConfig + App + asgi + __main__ (copy patterns, melpino fields)
- [x] errors.py ErrorSets + api/errors.py status map (fail-fast check)
- [x] db/base.py + models + 0000_initial_schema migration (03)
- [x] auth/: passwords, sessions, csrf, rate_limit (copy logand),
      booking_tokens (new, per 02)
- [x] api/health + api/auth + api/config_public
- [x] Admin seed lifespan hook; docker-compose.dev.yml verified
      (contract verified via plain docker run w/ the file's exact
      image/env/port -- no compose plugin on this host)
- [x] Migration round-trip integration test green (testcontainers)
- [x] GATE: backend `make check` green with real (non-skip) P2 tests
      (remaining skips are P3/P4/P5 booking/payments/waivers stubs)

## P3 -- Booking domain (docs/design/04; THE core)

- [x] domain/courses + domain/students (dedup) + services
- [x] domain/booking: capacity.py (FOR UPDATE), create/cancel/waitlist
- [x] Concurrent last-seat race integration test (flagship) green
- [x] api/courses + api/bookings (+honeypot, attestation, rate limits)
- [x] notifications/ (copy logand mailer/templates/notify + fake_smtp)
- [x] confirmation/cancel/waitlist-offer emails + reminders_sent ledger
- [x] scripts/scheduler.py sweep (reminders + completed flips)
- [x] Frontend: 3-step /book flow + /booking/{token} manage page wired
      to real API (guest journey Playwright test green)
- [ ] GATE: full guest system journey green in compose test stack

## P4 -- Payments (docs/design/05)

- [x] Copy+adapt: domain/invoices (service, refunds, stats, pdf/),
      domain/payments/providers/paypal.py, api/webhooks.py,
      testing/fake_stripe.py + fake_paypal.py + currency.py.
      stats.py now done (+ GET /api/admin/invoices/stats);
      recurrence.py stubbed w/ TODO(recurrence), unwired ("low
      priority" per doc 05 + Deferred below).
- [x] Invoice pay-tokens + /pay/{token} page -- BACKEND half only:
      STABLE derived tokens (HMAC(session_secret, invoice_id) -- an
      emailed link keeps working for the invoice's life; secret
      rotation = global revocation w/ re-key heal), GET/POST
      /api/pay/{token}/... surface, CSRF-exempt. Frontend /pay page
      NOT built yet (separate frontend task).
- [ ] P4 test gaps (agent interrupted; suite otherwise green 61+14):
      PDF renderer unit tests (LaTeX-escape chokepoint; latexmk IS
      present on this host, compiles a real PDF), refund-replay,
      per-route provider-unconfigured 503s, route-level pay-token
      isolation, stripe-intent concurrency race. Write before
      declaring the P4 GATE.
- [x] Deposit auto-invoice on booking (04/05 contract) -- wired into
      domain/booking/service.py::create_booking; unit/integration
      tested (deposit * party_size math, invoice_id linkage).
- [x] Manual payment recording endpoint (admin) -- POST
      /api/admin/invoices/{id}/manual-payment.
- [x] melpinoinvoice.cls letterhead w/ business_legal_name --
      renderer.py wires cfg.invoice_business_name (never a hardcoded
      name) into the existing .cls; no automated visual-output test
      exists (see report: only latex_escape logic is easily unit-
      testable without a real compile-and-inspect harness, which this
      pass did not build despite latexmk actually being present on this
      host -- flagged as a gap in the final report).
- [x] Payment idempotency/tamper/race tests copied + green (webhook
      replay idempotency, manual-payment row-lock race, refund balance
      guard, unconfigured-provider Result, amount never client-supplied)
- [ ] Revisit api/bookings.py + api/courses.py module-level AppConfig
      singleton (blocks per-test config injection; system tests
      monkeypatch module _cfg -- flagged during P3; prefer app.state
      or a Depends provider) -- NOT touched this pass; still open.
- [x] Fix AppConfig.payment_processor_secret default (was "sk_test_fake"
      making /api/config report stripe:true when nothing was
      configured; now None-means-unconfigured, matching paypal's
      convention; fixtures/tests updated to set it explicitly where a
      configured Stripe is actually needed)
- [ ] GATE: deposit journey green end-to-end vs fake-stripe (left
      unticked per instructions -- blocked on the frontend /pay/{token}
      page another agent owns)

## P5 -- Waivers + legal surface (docs/design/06)

- [ ] domain/storage (copy + namespace-privacy guard) + moto tests
- [ ] domain/waivers + api/waivers upload/list/stream
- [ ] Legal pages content pass; attestation text versioned; consent
      capture wired. HUMAN INPUT: resolve every VERIFY item in 06
      with Mel/counsel before real bookings.
- [ ] GATE: privacy guard test + waiver round-trip green

## P6 -- Admin mockup (docs/design/14; anytime after P1)

- [x] MSW browser/handlers/data + fake gate + MOCKUP banner
- [x] 8 mockup screens per 14's route list
- [x] Playwright mockup smoke test
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
