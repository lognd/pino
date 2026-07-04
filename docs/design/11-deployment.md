# 11 -- Deployment

Audience: anyone setting up Docker Compose, the VPS, or CI/CD. Read
[00-overview.md](00-overview.md) first. Normative reference:
logand.app's `docs/design/11-deployment.md` + its actual
`docker-compose*.yml`, `Caddyfile`, `.github/workflows/`, `ops/`, and
`backend/Dockerfile` -- copy those, then apply the deltas below.
logand.app's files carry years of debugged lessons in their comments
(compose `image:`+`build:` dual fields, the `alembic.ini` COPY, the
"no uv in final stage" PATH note, deploy.yml's wait-for-ci polling,
GHCR permissions) -- keep the lessons, do not strip the comments.

## Topology (locked: single Hetzner VPS, Docker Compose)

Same service set as logand.app minus nothing, plus nothing:

```
caddy       # TLS + static frontend/dist + /api/* reverse proxy
backend     # FastAPI image (ghcr.io/lognd/pino/backend)
migrate     # one-shot alembic profile
postgres    # postgres:16-alpine, named volume
redis       # rate limiting
scheduler   # same backend image, reminder sweep loop (see 04)
backup      # nightly pg_dump + storage tarball -> off-box R2
```

DNS via Cloudflare; media/waivers via R2
([13-storage-abstraction.md](13-storage-abstraction.md)). Domain TBD
(root README open question): Caddyfile uses
`{$SITE_DOMAIN:example.com}` env-substitution until it lands; nothing
else may hardcode the domain (grep-checked alongside the business-name
rule, see 00).

## Deltas from logand.app

- Image names: `ghcr.io/lognd/pino/backend` (repo is
  github.com/lognd/pino).
- No wasm build step anywhere (ci.yml/deploy.yml lose the wasm-ascii
  jobs and the double frontend build).
- Keep the LaTeX layer in backend/Dockerfile (invoice PDFs, see 05) --
  rename the doc-class file references.
- `docker-compose.test.yml`: same shape (postgres :5433, redis :6380,
  fake-stripe, backend with SEED_ADMIN_* and STRIPE_API_BASE pointed
  at the fake) -- melpino's Playwright suite drives the booking flow
  against it.
- VPS user/paths: service account `melpino`, repo at
  `/home/melpino/pino` (setup script: crib `ops/setup-vps.sh`).
- `ops/release_watch/`: copy as-is (it is a self-contained uv
  project), rename config defaults to the pino repo.

## CI/CD

- `ci.yml`: backend job (uv container, ruff+format-check+ty+pytest
  unit/integration), frontend job (node 22, lint+typecheck+vitest),
  then a combined system-tests job on `docker-compose.test.yml`
  (backend httpx suite + Playwright in the pinned
  mcr.microsoft.com/playwright image -- KEEP the version-pin lesson:
  @playwright/test pinned exactly, image tag matched to it).
- `deploy.yml`: copy logand's three-job shape (wait-for-ci polling
  gate -> build-and-push GHCR + frontend dist artifact -> rsync dist +
  ssh pull/migrate/up). Secrets: `VPS_HOST`, `VPS_USER`,
  `VPS_SSH_KEY` + app secrets listed in `docs/secrets.md`. Never
  echoed.

## Ops

Nightly backup (pg_dump + waiver/storage volume) to a DEDICATED R2
bucket with its own credentials, 30-backup retention, restore runbook
at `docs/runbooks/restore.md` -- copy `ops/backup.sh` +
`ops/backup.Dockerfile` and the runbook, adjust names. Waivers are
legal documents: the restore runbook must be tested once before the
first real class is booked (TODO.md gate).

## What NOT to put here

- Test stack usage -> [12-testing-strategy.md](12-testing-strategy.md)
- Secrets inventory -> `docs/secrets.md`
- Storage backend choice -> [13-storage-abstraction.md](13-storage-abstraction.md)
