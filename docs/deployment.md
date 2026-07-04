# Deployment -- from a bare VPS to a running site

Audience: whoever is standing this up for the first time, or
redeploying after a long gap.

**SCAFFOLD-STAGE STUB.** This doc describes a deployed system that
does not exist yet -- `backend/` and `frontend/` are not built, so
there is nothing to actually deploy today. See
[design/11-deployment.md](design/11-deployment.md) for the
architectural plan (topology, CI/CD shape, ops), and
[secrets.md](secrets.md) for the secret inventory already locked in.
This file's job is to become the literal step-by-step walkthrough
(prerequisites, clone/configure, build, `docker compose up`, DNS,
backups) once there's a real system behind it.

The scaffolded pieces already in this repo that this doc will
eventually walk through using: `Makefile`, `docker-compose.yml`,
`docker-compose.dev.yml`, `docker-compose.test.yml`, `Caddyfile`,
`ops/setup-vps.sh`, `ops/backup.sh`, `ops/release_watch/`,
`.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.

TODO(P7): write for real during the deploy phase (see TODO.md).
