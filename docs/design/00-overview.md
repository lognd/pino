# 00 -- Overview & Repo Layout

Read this first, always. It is the only doc with cross-cutting context.
Everything else assumes you already know what's here.

## What this project is

`melpino` is the website + business tool for **Mel Pino** -- a former
military/law-enforcement detective who teaches firearms law,
concealed-carry certification, and shooting technique in Clearwater,
Florida. It is two things at once:

1. A **public-facing site**: landing page (with the scrub-reactive
   firing-sequence hero, see [08-landing-hero.md](08-landing-hero.md)),
   course catalog, bio, contact, legal pages, and a **guest-first
   booking flow** that a tech-illiterate elderly first-time visitor can
   complete without creating an account.
2. A **protected admin/business tool** for running the training
   business: scheduling, rosters, invoicing, waiver storage. At this
   stage the admin tool is a **frontend-only mockup**
   ([14-admin-mockup.md](14-admin-mockup.md)) -- we are still
   discovering what Mel actually needs.

Guiding constraints from the root README (binding):

- **Booking must be as easy as possible.** The median student is an
  elderly first-time computer user. This overrides aesthetics and
  engineering elegance every time they conflict.
- **The brand is hard-edged** (black ground, red/white condensed italic
  wordmark, no rounded corners) -- see
  [09-design-system.md](09-design-system.md). Treat it as a design
  constraint, not a mood.
- **Landing page is the first real deliverable.**

## The logand.app crib sheet

This repo mirrors `~/projects/logand.app` structurally. When a doc says
"mirror logand.app," open the referenced file and copy its pattern.
The highest-value reference files:

| Building... | Crib from (paths under ~/projects/logand.app/) |
|---|---|
| App/AppConfig/entry point | `backend/src/logand_backend/app/app.py`, `app/config.py`, `__main__.py` |
| ErrorSet -> HTTP status mapping | `backend/src/logand_backend/errors.py`, `api/errors.py` |
| Sessions/CSRF/rate limit/passwords | `backend/src/logand_backend/auth/*` |
| Payments (Stripe flow, PayPal provider, manual recording) | `backend/src/logand_backend/domain/payments/`, `domain/invoices/service.py`, `api/webhooks.py` |
| PDF invoices (LaTeX) | `backend/src/logand_backend/domain/invoices/pdf/` |
| Email notifications (SMTP/Gmail OAuth2, CAN-SPAM) | `backend/src/logand_backend/domain/notifications/` |
| Storage protocol (local/R2) | `backend/src/logand_backend/domain/storage/` |
| Logging (JSON, rotation, request ids) | `backend/src/logand_backend/logging/` |
| Test fakes (real-protocol doubles) | `backend/src/logand_backend/testing/fake_*.py` |
| Frontend API client / guards / query | `frontend/src/api/client.ts`, `src/app/layout/*Guard.tsx` |
| Compose/Caddy/CI/deploy | `docker-compose*.yml`, `Caddyfile`, `.github/workflows/` |
| VPS-side ops (backup, release watch) | `ops/` |

Rules for cribbing: copy the pattern and the hard-won comments'
*lessons*, rename `logand`->`melpino` symbols, drop features melpino
doesn't need (budget, inventory BOM, mileage, wasm-ascii, android).
NEVER read `.env` files in either repo, and never copy logand.app's
visual design -- melpino's look is its own
([09-design-system.md](09-design-system.md)).

## Locked architectural decisions

Decided with the human up front. Do not reopen inside a design doc --
if a doc seems to need a different answer, stop and ask.

| Decision | Choice | Why |
|---|---|---|
| Database | PostgreSQL | Bookings + payments need audit-grade integrity and concurrent-write safety (seat capacity is a real race, see 04). Matches logand.app. |
| Repo layout | Monorepo, top-level `backend/`, `frontend/` | Two toolchains as siblings; mirrors logand.app minus the Rust/Android subprojects. |
| Admin auth | Server-side session cookies (HttpOnly, Secure, SameSite=Strict), DB-backed | Instant revocation, simple threat model; identical mechanics to logand.app. |
| Student booking auth | No accounts. Guest checkout + signed manage-booking links delivered by email | The audience cannot be asked to invent and remember passwords. See 02. |
| Payments | Stripe primary; PayPal optional; Zelle/in-person recorded manually | Reuse logand.app's proven provider abstraction and row-lock discipline verbatim. |
| Deployment | Single Hetzner VPS, Docker Compose, Caddy, Cloudflare DNS + R2 | Mirrors logand.app's working topology; see 11. |
| Admin app | Frontend-only MSW mockup until scope is validated with Mel | Cheapest way to discover real requirements; see 14. |
| Landing hero | Simulated sequence first, real video swappable later behind one interface | See 08 -- the swap is an interface contract, not a rewrite. |

## Business identity (configurable -- bulletproof rule)

The public brand is "Mel Pino" and the legal name is "Mel Pino, LLC",
but **this may change**. Both live in exactly two places, and nowhere
else:

1. **Backend**: `AppConfig.business_legal_name` /
   `AppConfig.business_short_name` (env vars `BUSINESS_LEGAL_NAME`,
   `BUSINESS_SHORT_NAME`) -- used in invoices, emails, PDF letterhead.
2. **Frontend**: `frontend/src/lib/brand.ts` (env vars
   `VITE_BUSINESS_LEGAL_NAME`, `VITE_BUSINESS_SHORT_NAME` with the same
   defaults) -- used in titles, headers, legal-page text interpolation.

Every other file interpolates from one of those two sources. Grepping
the repo for a hardcoded "Mel Pino" outside the sanctioned homes must
return nothing -- [12-testing-strategy.md](12-testing-strategy.md)
makes this an actual CI check. Sanctioned homes (audited; the CI
policy job's exclusion list mirrors this exactly): the two config
homes above, the env-example files documenting their defaults,
project prose (docs/, README.md, TODO.md), the wordmark SVG asset,
static build-time text that cannot import brand.ts
(frontend/index.html fallbacks and public/llms.txt, both
SAMPLE-marked -- update them when the brand changes), Playwright
system-test literals (node context, cannot import brand.ts), and the
CI policy job itself. Changing the brand = change the two config
homes + regenerate/re-edit the static sanctioned files.

Domain is undecided (root README open question) -- Caddyfile and
configs use a `SITE_DOMAIN` placeholder until it lands.

## Repo layout

```
melpino/
  backend/                   # Python, FastAPI + pydantic + typani
    src/melpino_backend/
      app/                   # App / AppConfig pattern (see 01)
      api/                   # FastAPI routers, one module per feature
      domain/                # pydantic models, business logic
      db/                    # SQLAlchemy models, migrations (alembic)
      auth/                  # sessions, passwords, rate limiting, booking tokens
      logging/               # standard logging module (~/.claude/refs/logging.md)
    tests/{unit,integration,system}/
    pyproject.toml
    Makefile

  frontend/                  # TypeScript + React + Tailwind + Vite
    src/
      app/                   # routes (public/, admin/) + layout/
      hero/                  # landing hero module (see 08)
      components/
      api/                   # typed client, one file per backend feature
      content/               # mock.ts -- ALL copy, clearly marked (see 10)
      mocks/                 # MSW handlers for the admin mockup (see 14)
      lib/                   # brand.ts, logging.ts, time.ts
      styles/                # tokens.css, tailwind.css
    tests/{unit,integration,system}/
    package.json
    Makefile

  docs/
    design/                  # this directory -- pre-implementation specs
    (deployment.md, secrets.md, usage.md land in docs/ root post-build)

  ops/                       # VPS-side tooling (backup, release watch)
  .github/workflows/         # CI (every PR) + deploy (push to main)
  docker-compose.yml         # prod stack
  docker-compose.dev.yml     # local: postgres + redis only
  docker-compose.test.yml    # CI system-test stack
  Caddyfile
  Makefile                   # delegates to backend/frontend
  TODO.md                    # master build checklist -- drive to zero
```

Each subproject is independently buildable via its own Makefile. The
root Makefile composes them.

## Cross-cutting non-negotiables

- **Never** read, log, or transmit `.env` contents or GitHub Actions
  secret values. Load via `python-dotenv` / `import.meta.env`; fake
  placeholder values only in examples.
- **No plaintext secrets anywhere** -- passwords Argon2id-hashed,
  session and booking-manage tokens random + SHA-256-hashed at rest,
  provider secrets only in `.env` / CI secrets.
- **Rate limiting** on every public endpoint; the unauthenticated
  booking endpoints are the highest-abuse surface (see 02).
- **TypeScript everywhere on the frontend** -- no plain `.js`.
- Backend: `from __future__ import annotations` first line of every
  module, `src/` layout, pydantic v2 (`model_config = {}`, never
  `class Config`), typani `Result`/`Option`/`ErrorSet` for fallible
  operations, module-logger logging per `~/.claude/refs/logging.md`.
- Conventions come from `~/.claude/refs/python.md`,
  `~/.claude/refs/pydantic.md`, `~/.claude/refs/typani.md`,
  `~/.claude/refs/python-app.md`, `~/.claude/refs/frob.md` -- read them
  at the start of any backend coding session; docs here don't restate
  them.
- **Mock content is clearly marked** -- every placeholder string
  renders with a visible "SAMPLE" marker and lives only in
  `frontend/src/content/mock.ts` (see 10) or `frontend/src/mocks/`
  (admin mockup, see 14).
- **ASCII only in every file.** No exceptions, including docs.

## Open questions deferred to later docs

Each is owned by exactly one doc; don't duplicate the decision
elsewhere:

- Guest booking token mechanics, rate limits -> [02-auth-and-security.md](02-auth-and-security.md)
- Concrete table schemas -> [03-database.md](03-database.md)
- Booking state machine, capacity locking, waitlist -> [04-booking-and-scheduling.md](04-booking-and-scheduling.md)
- Deposit semantics, provider config -> [05-payments-and-invoicing.md](05-payments-and-invoicing.md)
- Hero simulation vs. video swap contract -> [08-landing-hero.md](08-landing-hero.md)
- What we still need from Mel (bio, prices, footage, domain) -> each
  doc's own "Open questions for Mel" section; TODO.md aggregates them.
