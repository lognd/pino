# Secrets -- what exists, where it lives, how to rotate it

Audience: whoever is deploying or operating this site. Read
[deployment.md](deployment.md) first if you're setting things up for
the first time; this doc is specifically about the secret *names* and
*rotation mechanics*, not the deploy mechanics around them.

**Hard rule, repeated from [design/00-overview.md](design/00-overview.md):
nobody (human or AI agent) should ever `cat`, print, log, or echo the
real contents of `backend/.env` or any GitHub Actions secret.** Generate
new values, write them into the right place, and move on -- don't read
existing ones back out to "confirm" them.

## Where secrets live

| Secret | Lives in | Never lives in |
|---|---|---|
| Everything below | `backend/.env` (gitignored, VPS-local) | git, logs, chat, this repo |
| `VPS_SSH_KEY`, and copies of everything below | GitHub Actions repo secrets (`Settings > Secrets and variables > Actions`) | anywhere in workflow YAML as a literal value |

`backend/.env.example` (once `backend/` exists -- see
[design/01-backend-architecture.md](design/01-backend-architecture.md))
documents every variable's *name* and a fake placeholder value -- copy
it to `backend/.env` and fill in real values, never the other way
around.

## Full inventory

### `DATABASE_URL` / `POSTGRES_PASSWORD`

Postgres connection string, `postgresql+asyncpg://melpino:password@host:5432/melpino`.
`POSTGRES_PASSWORD` is the same password, read separately by
`docker-compose.yml`'s `postgres` service. Rotating: change it in
Postgres itself (`ALTER USER melpino WITH PASSWORD '...'`), update
`backend/.env` and the GitHub Actions secret to match, then restart the
`backend` container. Rotate immediately if it's ever exposed.

Placeholder for local dev only (see `docker-compose.dev.yml`):
`changeme` -- never used in a real deployment.

### `REDIS_URL`

Only meaningful if Redis is actually reachable at that address -- rate
limiting on the unauthenticated booking endpoints (the highest-abuse
surface, see [design/02-auth-and-security.md](design/02-auth-and-security.md))
should fail closed to an in-process limiter, not fail open, if Redis is
briefly unreachable. No credential to rotate unless a password is put
on Redis directly.

### `SESSION_SECRET`

HMAC key for signing **CSRF tokens** and the admin session mechanism
(see [design/02-auth-and-security.md](design/02-auth-and-security.md)).

Generate:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Rotating invalidates every CSRF token currently held by an open browser
tab -- an admin mid-session sees their next state-changing request
rejected and needs to reload. Session cookies themselves are
DB-backed, not signed by this key, so a reload is all that's needed.

### `PAYMENT_PROCESSOR_SECRET` (Stripe secret key)

From the Stripe dashboard -- `sk_test_...` for test mode, `sk_live_...`
for real charges. **Never commit a real value** -- example files only
ever use `sk_test_fake`.

Rotating: generate a new key in the Stripe dashboard (revokes the old
one after a grace period), update `backend/.env` and GitHub Actions,
restart `backend`. Do this immediately if a key is ever exposed.

### `STRIPE_WEBHOOK_SECRET`

From the Stripe CLI (`stripe listen --print-secret`, local dev) or the
Stripe dashboard's webhook endpoint configuration (production, once a
real `https://<domain>/api/webhooks/stripe` endpoint is registered).
Rotating: roll the signing secret on the webhook endpoint in the Stripe
dashboard, update `backend/.env`/GitHub Actions, restart `backend`.

### `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_MODE`

Fully optional -- see
[design/05-payments-and-invoicing.md](design/05-payments-and-invoicing.md).
Unset means PayPal simply isn't offered as a checkout option; students
still see Stripe, Zelle, and in-person/manual recording.

Create a REST API app in the
[PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications),
copy its Client ID and Secret. Use the Sandbox app's credentials first
(`PAYPAL_MODE=sandbox`) before switching to a Live app and
`PAYPAL_MODE=live`.

Rotating: regenerate the secret for the same app in the PayPal
dashboard, update `backend/.env`/GitHub Actions, restart `backend`.

### `ZELLE_HANDLE`

Optional, not secret -- a phone number or email the Zelle account is
registered under. Once set, a customer's pay page shows it directly as
a real option instead of generic "contact us" text.

### `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_USE_TLS` / `SMTP_FROM_ADDRESS`

Fully optional -- unset (and `GMAIL_*` below also unset) means email
notifications (booking confirmation, manage-link, waiver reminder) are
a silent no-op. Do not use `smtp.gmail.com` here if the sending address
is a Google Workspace account (password-based SMTP auth is retired for
Workspace) -- use the Gmail OAuth2 block below instead in that case.

```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USERNAME=bookings@yourdomain.com
SMTP_PASSWORD=<the provider's real password or API key>
SMTP_USE_TLS=true
SMTP_FROM_ADDRESS=bookings@yourdomain.com
```

Rotating: regenerate the password/API key at the provider, update
`backend/.env`/GitHub Actions, restart `backend`.

### `GMAIL_SERVICE_ACCOUNT_JSON` / `GMAIL_SENDER_EMAIL`

OAuth2 via a domain-wide-delegation service account, for sending
through a Google Workspace mailbox. `GMAIL_SERVICE_ACCOUNT_JSON` is the
entire downloaded key file's content, as one line -- **a real,
sensitive credential**, never committed or pasted anywhere but
`backend/.env`. `GMAIL_SENDER_EMAIL` is the impersonated mailbox (also
what appears in the `From` header).

Rotating: delete the old key in the Cloud Console, create a new one,
update `GMAIL_SERVICE_ACCOUNT_JSON`, restart `backend`. The Client ID
doesn't change on key rotation, so the Workspace Admin domain-wide
delegation authorization does not need to be redone.

### `MAILING_ADDRESS`

Not secret, but legally required once email is turned on: CAN-SPAM
requires a valid physical postal address in every commercial email's
footer. Set this to the real business mailing address before turning
on `SMTP_HOST` or `GMAIL_SENDER_EMAIL`.

### `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`

**Not a long-lived secret -- an opt-in bootstrap mechanism.** Setting
both creates (or resets the password of) an admin account with those
credentials on every app startup. There is no other way to create an
admin account.

Recommended usage: set both, deploy/restart once, log in and confirm,
then remove both and restart again. A production deployment shouldn't
carry a well-known admin password in an env var indefinitely.

### `STORAGE_BACKEND` / `STORAGE_LOCAL_DIR` / `R2_*` (media/waivers)

See [design/13-storage-abstraction.md](design/13-storage-abstraction.md)
for the local-vs-R2 tradeoffs. `STORAGE_BACKEND` is `local` (default,
needs nothing else set -- `STORAGE_LOCAL_DIR` defaults to
`./data/storage`, gitignored) or `r2`.

To turn on R2: create an R2 bucket in the Cloudflare dashboard, create
an API token scoped to that bucket, then set:

```
STORAGE_BACKEND=r2
R2_BUCKET=your-bucket-name
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<from the API token>
R2_SECRET_ACCESS_KEY=<from the API token>
```

Rotating: revoke and recreate the API token in the Cloudflare
dashboard, update `backend/.env`/GitHub Actions, restart `backend`.
Rotating does NOT invalidate already-stored files (waivers/media) --
only the credentials used to access them.

### `BACKUP_R2_BUCKET` / `BACKUP_R2_ENDPOINT_URL` / `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY`

Deliberately **separate** from the `R2_*` set above, even though both
are R2 credentials -- these are `ops/backup.sh`'s off-box push
destination (nightly `pg_dump` + waiver/storage-volume tarball), used
regardless of whether `STORAGE_BACKEND` is `local` or `r2`. Keeping
them as separate credentials/bucket means a bug or compromise in one
can't touch the other (the app can't accidentally overwrite backups, a
backup-script bug can't corrupt live waiver files). Waivers are legal
documents -- see
[design/06-waivers-and-legal.md](design/06-waivers-and-legal.md) and
[runbooks/restore.md](runbooks/restore.md) -- so this isolation is not
just defense in depth, it's a real requirement.

Setup: create a **second** R2 bucket (separate from any
`STORAGE_BACKEND=r2` bucket), create an API token scoped to only that
bucket, then set:

```
BACKUP_R2_BUCKET=your-backup-bucket-name
BACKUP_R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
BACKUP_R2_ACCESS_KEY_ID=<from the API token>
BACKUP_R2_SECRET_ACCESS_KEY=<from the API token>
```

Rotating: revoke and recreate the API token, update `backend/.env`,
restart the `backup` service. Rotating does NOT invalidate
already-pushed backups.

### `BUSINESS_LEGAL_NAME` / `BUSINESS_SHORT_NAME`

**Not secret** -- but deliberately env-configured rather than
hardcoded, since the public brand name may change (see
[design/00-overview.md](design/00-overview.md)'s "Business identity"
section). Backend uses these two env vars (via `AppConfig`); the
frontend mirrors them as `VITE_BUSINESS_LEGAL_NAME` /
`VITE_BUSINESS_SHORT_NAME`. Every other file interpolates from one of
these two sources -- CI's `policy` job greps for a hardcoded "Mel Pino"
outside them (plus docs/ and the wordmark asset).

### `SITE_DOMAIN`

**Not secret** -- domain is undecided as of this writing (see
[design/00-overview.md](design/00-overview.md) and the root README's
open questions). Used only by `Caddyfile`'s
`{$SITE_DOMAIN:example.com}` env-substitution; set it on the VPS once
the real domain lands. CI's `policy` job greps for a hardcoded real
domain anywhere else in the repo.

### GitHub Actions secrets specifically

`.github/workflows/deploy.yml` reads `VPS_HOST`, `VPS_USER`,
`VPS_SSH_KEY`, plus copies of the app secrets above, to build and ship
the backend image and restart it over SSH. Add/update these under the
repo's **Settings > Secrets and variables > Actions**. Never reference
a secret's value directly in workflow YAML output (no `echo
${{ secrets.X }}`) -- GitHub masks known secret values in logs, but
that masking is best-effort, not a substitute for just not printing
them.

## If a secret is ever actually exposed

1. Rotate it immediately using the steps above -- don't wait to
   investigate first.
2. If it was committed to git (even briefly), treat the *value* as
   burned permanently -- rotating it is sufficient; you do not also
   need to rewrite git history.
3. Check the relevant provider's own access/audit logs (Stripe,
   PayPal, Cloudflare, your VPS provider) for anything that happened
   using the exposed credential before you rotated it.
