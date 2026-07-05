# Deployment -- from a bare VPS to a running site

Audience: whoever is standing this up for the first time (e.g. on a
fresh Hetzner box), or redeploying after a long gap. See
[design/11-deployment.md](design/11-deployment.md) for the
architectural plan behind these steps, and [secrets.md](secrets.md) for
the full secret inventory + rotation mechanics referenced below.

## 0. Prerequisites

- A fresh Ubuntu/Debian VPS (these steps assume Ubuntu 22.04+) with root
  or sudo SSH access, and an SSH key already added at server-creation
  time.
- A domain you control, so you can point DNS at the VPS's IP (needed
  for step 6's real TLS cert; everything before that works fine on the
  bare IP over plain HTTP for smoke-testing).
- This repo's GitHub remote, and (if you want CI/CD deploys, not just
  the manual first deploy below) the four repo secrets `VPS_HOST`,
  `VPS_USER`, `VPS_SSH_KEY`, `SITE_DOMAIN` set under **Settings > Secrets
  and variables > Actions** -- see [secrets.md](secrets.md).

## 1. Host setup

SSH in as root (or a sudo-capable user) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/lognd/pino/main/ops/setup-vps.sh | sh
```

or, having already cloned the repo somewhere:

```bash
sh ops/setup-vps.sh
```

This installs Docker Engine + the `docker compose` plugin (via the
official Docker apt repo -- not `docker-compose-plugin` from the
distro's own mirrors, which may not carry it; not a manual
`docker-compose` Python package either, which is unmaintained and
incompatible with modern `docker-py`), Node.js LTS (for this one-time
manual build only -- CI builds the frontend on every subsequent
deploy), git, and `ufw` (opens 22/80/443, denies the rest). It also
creates a non-root `melpino` service account, adds it to the `docker`
group, and copies your SSH key over so day-to-day operation (and
`deploy.yml`'s SSH deploy step) never needs root. The script is
idempotent -- safe to re-run.

Once it finishes, confirm `ssh melpino@<host>` works before continuing,
then follow the printed reminder to lock down root SSH
(`PermitRootLogin no` in `/etc/ssh/sshd_config`, `systemctl restart
sshd`) -- the script deliberately does not do this for you
automatically.

## 2. Clone the repo (as the `melpino` user)

```bash
ssh melpino@<host>
git clone <this-repo-url> pino && cd pino
```

`deploy.yml`'s automated deploy step assumes the repo lives at exactly
`/home/melpino/pino` -- clone it there, not somewhere else.

## 3. Configure secrets

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env` and fill in real values. At minimum for a
first deploy:

- `DATABASE_URL` / `POSTGRES_PASSWORD` -- pick a real password, put it
  in **both** (they're read by two different services -- see
  [secrets.md](secrets.md)'s entry on this).
- `SESSION_SECRET` -- generate with
  `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`.
- `PUBLIC_BASE_URL` -- `https://<your-real-domain>`.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` -- set both to create the
  first admin account, log in once to confirm, then unset both and
  redeploy (see [secrets.md](secrets.md)'s note on why this isn't a
  long-lived credential).

Everything else (Stripe/PayPal/SMTP/Gmail/R2/backup credentials) is
optional and can be added later -- unset means that feature is simply
not offered yet (see [secrets.md](secrets.md) for what each one
unlocks).

Set `SITE_DOMAIN` in the shell environment (or a root `.env` next to
`Caddyfile`, whichever this VPS's process manager picks up) to your
real domain, e.g. `export SITE_DOMAIN=melpino.com` -- `Caddyfile`
interpolates this for automatic Let's Encrypt TLS. Point the domain's
DNS A record at this VPS's IP before step 6, or Caddy's cert request
will fail.

## 4. Build the frontend (first deploy only)

```bash
cd frontend && npm ci && npm run build && cd ..
```

Ongoing deploys build this in CI (`.github/workflows/deploy.yml`) and
rsync the result here instead -- this manual build is only to get a
working `frontend/dist/` in place before the first `docker compose up`.

## 5. Bring up the database, migrate, then the full stack

```bash
docker compose up -d postgres redis
docker compose --profile migrate run --rm migrate
docker compose up -d backend caddy backup scheduler
```

Check everything is healthy:

```bash
docker compose ps
docker compose logs -f backend
```

Visit `https://<your-domain>` (or `http://<vps-ip>` before DNS/TLS is
set up) and confirm the site loads. Log into `/admin/login` with the
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` you set in step 3, confirm it
works, then remove those two vars from `backend/.env` and
`docker compose restart backend`.

## 6. Ongoing deploys (CI/CD)

Once the four GitHub Actions secrets from step 0 are set, every push to
`main` that passes `ci.yml` triggers `deploy.yml`: it builds and pushes
a new backend image to `ghcr.io`, builds the frontend, rsyncs
`frontend/dist/` to `/home/melpino/pino/frontend/dist`, then over SSH
runs `git fetch && git reset --hard origin/main`, pulls the new image,
runs migrations, and restarts `backend`/`caddy`/`scheduler`. No manual
steps needed after the first deploy above.

To redeploy manually (e.g. after an out-of-band `.env` change with no
new commit):

```bash
cd /home/melpino/pino
docker compose pull backend scheduler
docker compose --profile migrate run --rm migrate
docker compose up -d backend caddy scheduler
```

## 7. Backups and restores

The `backup` service (`ops/backup.sh`, running continuously in its own
container) pushes nightly `pg_dump` + waiver/storage tarballs to the
`BACKUP_R2_*` bucket once those vars are set in `backend/.env` --
deliberately a separate bucket/credential from `STORAGE_BACKEND=r2`
(see [secrets.md](secrets.md)). See
[runbooks/restore.md](runbooks/restore.md) for the restore procedure.

## What NOT to look for here

- Secret *names*, generation, and rotation steps --
  [secrets.md](secrets.md).
- Why the topology looks like this (single VPS, Caddy in front, image
  built once and reused for backend/scheduler) --
  [design/11-deployment.md](design/11-deployment.md).
- Restoring from a backup -- [runbooks/restore.md](runbooks/restore.md).
