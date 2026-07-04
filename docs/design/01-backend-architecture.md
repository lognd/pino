# 01 -- Backend Architecture

Audience: anyone building the Python backend skeleton, wiring FastAPI,
or adding a new backend module. Read [00-overview.md](00-overview.md)
first for repo layout and the logand.app crib sheet. Read
`~/.claude/refs/python.md`, `~/.claude/refs/pydantic.md`,
`~/.claude/refs/typani.md`, `~/.claude/refs/python-app.md` before
writing code -- this doc assumes those conventions.

## Stack (identical to logand.app)

- FastAPI + pydantic v2 + typani (`Result`/`Option`/`ErrorSet`)
- SQLAlchemy 2.x async + asyncpg against PostgreSQL, Alembic migrations
- Argon2id (`argon2-cffi`) for passwords, Redis for rate limiting
- `uv` package manager, `ruff` + `ty` + `pytest -n auto` toolchain
- Package name: `melpino_backend`, script entry `melpino-backend`

`backend/pyproject.toml` mirrors logand.app's minus what melpino does
not need. Keep: fastapi, uvicorn[standard], pydantic, sqlalchemy
[asyncio], asyncpg, alembic, argon2-cffi, redis, stripe, python-dotenv,
python-multipart, jinja2, httpx, typani, boto3, cryptography. Dev group
identical (pytest, pytest-asyncio, pytest-xdist, pytest-cov, ruff, ty,
testcontainers[postgres], httpx, aiosmtpd, moto[s3]). Copy the
`[tool.coverage.run] concurrency = ["greenlet"]` setting and its
comment -- the async-coverage false-negative it fixes will bite here
too.

## Directory structure

```
backend/src/melpino_backend/
  __main__.py            # argparse -> AppConfig.from_external -> App(cfg)()
  asgi.py                # module-level `app` for uvicorn workers in Docker
  app/
    app.py               # App class: FastAPI instance, lifespan, middleware, routers
    config.py            # AppConfig(BaseModel) -- field list below
  api/                   # thin routers, one per feature; no business logic
    errors.py            # ErrorSet -> HTTP status map (fail fast at import)
    health.py            # GET /api/health
    config_public.py     # GET /api/config -- brand + available payment methods
    auth.py              # admin login/logout/me
    courses.py           # public course catalog + session listings
    bookings.py          # public booking create/lookup/cancel (guest tokens)
    invoices.py          # admin invoices (mirrors logand api/invoices.py)
    invoices_public.py   # pay-by-link surface (mirrors logand)
    webhooks.py          # Stripe webhooks (signature auth, CSRF-exempt)
    admin_schedule.py    # admin CRUD for courses/sessions (post-mockup, stub now)
    admin_students.py    # admin roster/records (post-mockup, stub now)
    waivers.py           # waiver upload/list (admin) -- see 06
  domain/                # business logic, framework-agnostic
    booking/             # service.py, capacity.py, tokens are in auth/
    courses/             # service.py
    students/            # service.py
    invoices/            # service.py, pdf/ (copy logand's LaTeX pipeline)
    payments/            # providers/paypal.py, currency.py (copy logand)
    notifications/       # mailer.py, templates.py, notify.py (copy logand)
    waivers/             # service.py
    storage/             # base.py Protocol, local.py, r2.py, factory.py (copy logand)
  db/
    base.py              # engine/sessionmaker init + dispose
    models/              # one file per table group -- see 03
    migrations/          # alembic env + versions/
  auth/
    sessions.py          # admin session create/validate/revoke (copy logand)
    passwords.py         # Argon2id (copy logand)
    csrf.py              # double-submit (copy logand)
    rate_limit.py        # Redis token bucket w/ in-process fallback (copy logand)
    booking_tokens.py    # guest manage-token mint/hash/verify -- see 02 (NEW)
  logging/               # copy ~/.claude/refs/logging.md layout verbatim,
                         # plus logand's json_formatter/handler/request_context/
                         # retention additions
  errors.py              # all ErrorSet definitions (single home)
  scripts/
    scheduler.py         # daily loop: reminders + session-status sweeps (see 04)
    health_check.py      # prod health probe (crib logand's)
  testing/
    fake_stripe.py       # copy from logand -- real-protocol HTTP doubles
    fake_paypal.py
    fake_smtp.py
```

## Layering rule (identical to logand.app)

`api/` calls `domain/`, never `db/` directly. `domain/` calls `db/` and
never imports FastAPI. Domain functions return
`Result[T, SomeError]`; routers unwrap:

```python
result = await create_booking(db, payload)
if result.is_err:
    raise to_http_exception(result.danger_err)
return result.danger_ok
```

`api/errors.py` maps EVERY ErrorSet variant to a status code and raises
`NotImplementedError` at import time for unmapped variants -- copy
logand's `_verify_complete_mapping` + `to_http_exception` (including
the machine-readable `code` field in the detail payload; the frontend
branches on `code`, never on prose).

## ErrorSet definitions (backend/src/melpino_backend/errors.py)

Declare exactly these (variant -> HTTP status the api/errors.py map
must carry). Message prose may be tuned; variants may not be dropped.

```
AuthError:      InvalidCredentials 401, SessionExpired 401,
                SessionNotFound 401, PasswordInvalidLength 422
BookingError:   SessionNotFound 404, SessionFull 409 (waitlist offered),
                SessionNotBookable 409 (past/cancelled/draft),
                DuplicateBooking 409 (same email+session),
                NotFound 404, TokenInvalid 404 (never confirm existence),
                AlreadyCancelled 409, CancellationWindowClosed 409,
                PartySizeInvalid 422, AttestationRequired 422 (see 06)
CourseError:    NotFound 404, SessionOverlap 409 (admin scheduling),
                CapacityBelowBooked 422
StudentError:   NotFound 404
InvoiceError:   NotFound 404, NotOwned 404, InvalidState 409,
                AmountMismatch 422, PaymentPending 409
RefundError:    copy logand's variants/status codes verbatim
WaiverError:    NotFound 404, StudentNotFound 404,
                UnsupportedContentType 422
PaymentProviderError: NotConfigured 503, RequestFailed 502
```

## AppConfig fields (app/config.py)

Copy logand's `from_external` pattern (load_dotenv -> env map -> CLI
args -> model_validate; never read `.env` directly). Fields = logand's
core set (database_url, redis_url=None, session_secret, stripe pair +
api_base override, paypal quad, seed_admin pair, smtp/gmail block,
mailing_address, storage block, host/port) with these changes:

- ADD `business_legal_name: str = "Mel Pino, LLC"` (BUSINESS_LEGAL_NAME)
- ADD `business_short_name: str = "Mel Pino"` (BUSINESS_SHORT_NAME)
- ADD `public_base_url: str = "https://SITE-DOMAIN-TBD"` -- domain
  undecided, see 00
- ADD `booking_cancellation_hours: int = 24` (see 04)
- ADD `reminder_days_before: int = 2` (see 04)
- ADD `zelle_handle: str | None = None` (same semantics as logand)
- RENAME invoice_business_* -> derive from business_* fields (do not
  keep two names for the same business)
- DROP: r2_public_base_url stays (course PDFs may go public later),
  everything mileage/inventory/budget-specific does not exist here

Default DSN: `postgresql+asyncpg://melpino:changeme@localhost:5432/melpino`.

## App class (app/app.py)

Copy logand's App verbatim in structure: `App(cfg)()` returns FastAPI;
request-logging middleware outermost (one JSON access line per request,
X-Request-Id correlation); CSRF middleware with the session-bound
double-submit check and the same lessons (rollback the idle-slide on
CSRF failure, release the DB connection before call_next). CSRF-exempt
paths for melpino:

- `/api/auth/login` (no session yet)
- `/api/webhooks/*` (Stripe signature is the auth)
- `/api/bookings` POST + `/api/bookings/manage/*` (guest surface: no
  session cookie exists for guests at all; the manage token itself is
  the auth, and creation is rate-limited + attestation-gated instead --
  see 02)

Lifespan: init engine, optional admin seed (SEED_ADMIN_EMAIL/PASSWORD
opt-in pair, same as logand), dispose on shutdown.

## Makefile

Standard frob-project format (`install test test-fast coverage lint fmt
typecheck check bump clean`) + `migrate:` (alembic upgrade head) +
`healthcheck:`. `check` = lint + typecheck + test + `frob check src/`.

## What NOT to put here

- Auth mechanics -> [02-auth-and-security.md](02-auth-and-security.md)
- Schema -> [03-database.md](03-database.md)
- Booking domain -> [04-booking-and-scheduling.md](04-booking-and-scheduling.md)
- Payments -> [05-payments-and-invoicing.md](05-payments-and-invoicing.md)
- Tests -> [12-testing-strategy.md](12-testing-strategy.md)
