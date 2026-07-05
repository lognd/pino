# Design Docs Index -- melpino

This is the entry point for design documentation. Each document below is
self-contained: an agent assigned to a task should read **only** the
document(s) relevant to that task, not the whole set.

Source of truth for product intent: `/README.md` (repo root). These docs
translate that intent into concrete, buildable specs. If a doc and the
root README conflict, the root README's intent wins -- file a note in
the doc and ask the human, don't silently pick one.

This repo deliberately mirrors `~/projects/logand.app` (the "golden
boy") for everything structural: backend patterns, auth mechanics,
payments, storage, deployment, testing. Where a doc here says "mirror
logand.app," the referenced logand.app file is the normative example --
copy its pattern, rename its symbols, and adapt its domain. Where this
project differs (brand, booking domain, guest-first UX, admin mockup),
the doc here is the source of truth.

## Reading map (find your task, read only those docs)

| If you are building...                          | Read |
|---------------------------------------------------|------|
| The Python backend skeleton, app structure, FastAPI wiring | [01-backend-architecture.md](01-backend-architecture.md) |
| Login, sessions, guest booking tokens, rate limiting, CSRF | [02-auth-and-security.md](02-auth-and-security.md) |
| Database schema, migrations, ORM models | [03-database.md](03-database.md) |
| Courses, class sessions, bookings, waitlists, reminders | [04-booking-and-scheduling.md](04-booking-and-scheduling.md) |
| Payments (Stripe/PayPal/Zelle/in-person), deposits, invoices | [05-payments-and-invoicing.md](05-payments-and-invoicing.md) |
| Waiver storage, disclaimers, eligibility gating, legal pages | [06-waivers-and-legal.md](06-waivers-and-legal.md) |
| The TypeScript/Tailwind frontend app shell | [07-frontend-architecture.md](07-frontend-architecture.md) |
| The landing hero (cursor-scrubbed firing sequence + wordmark) | [08-landing-hero.md](08-landing-hero.md) |
| Visual design, typography, color, motion, accessibility | [09-design-system.md](09-design-system.md) |
| SEO, structured data, the mock-content convention | [10-seo-and-content.md](10-seo-and-content.md) |
| Docker Compose, VPS deployment, CI/CD | [11-deployment.md](11-deployment.md) |
| Unit/integration/system tests for any component | [12-testing-strategy.md](12-testing-strategy.md) |
| File storage (waivers, course PDFs, hero media), local vs. R2 | [13-storage-abstraction.md](13-storage-abstraction.md) |
| The admin/business app mockup (MSW fake data) | [14-admin-mockup.md](14-admin-mockup.md) |
| The carousel, gallery page, R2 media serving, click-to-play video | [15-media-and-gallery.md](15-media-and-gallery.md) |

**Every component is required to have unit, integration, and end-to-end
system tests -- backend and frontend both.**
[12-testing-strategy.md](12-testing-strategy.md) is not optional
reading; every feature doc above links into it for its specific test
obligations.

[00-overview.md](00-overview.md) is the only doc every agent should
skim first -- it has the repo layout, the logand.app crib sheet, and
cross-cutting decisions everything else assumes.

## Status

These docs are **design-stage**: written before any implementation
exists. The repo is scaffolded (stubs + TODO markers only). Keep each
doc updated in the same change as the code whenever implementation
diverges from what the doc says -- never leave a doc frozen at design
time.

## Locked decisions (do not re-litigate without asking the human)

- Database: **PostgreSQL**.
- Repo layout: **monorepo**, top-level `backend/`, `frontend/`.
- Auth: **server-side session cookies** (HttpOnly, Secure, SameSite)
  for admin/staff; **signed one-time manage links** (no accounts, no
  passwords) for people who book classes. See
  [02-auth-and-security.md](02-auth-and-security.md).
- Deployment: **single Hetzner VPS via Docker Compose**, Caddy in
  front, Cloudflare DNS + R2 for media.
- Public deliverable order: **landing page first**; the admin app is a
  **frontend-only mockup** until Mel's real needs are discovered
  ([14-admin-mockup.md](14-admin-mockup.md)).
- Landing hero: **simulated firing sequence first**, architected so a
  real slow-mo clip can replace it later without a rewrite
  ([08-landing-hero.md](08-landing-hero.md)).
- Business identity: "Mel Pino, LLC" / "Mel Pino", **configurable in
  exactly two places** -- see 00-overview.md's "Business identity"
  section.

See [00-overview.md](00-overview.md) for the reasoning behind each.
