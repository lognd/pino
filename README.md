# melpino

Website + booking/business tool for **Mel Pino** -- a former
military/law-enforcement detective who now teaches firearms law,
concealed-carry certification, and shooting technique. Public marketing
site (landing, courses, instructor bio, contact/booking) plus a
protected admin tool behind auth for the day-to-day of running a
training business: class scheduling, student rosters, invoicing, and
course/waiver document handling.

The brand is deliberately hard-edged and "manly" (Mel's word): black
ground, blunt red/white wordmark (see the `MEL PINO` logo lockup),
heavy condensed type, high contrast, no rounded-corner softness. Treat
that as a design constraint, not a mood -- it's in the type scale and
palette, documented in `docs/design/` once specs land.

<!-- NOTE(logan): this README only covers how to run the repo. Anything
     about WHAT to build or WHY -- feature scope, the app mockups, the
     landing-page interaction spec -- lives in docs/design/, link to it
     from here, don't restate it. -->

## Workflow

Plan EVERYTHING first before you implement. Take notes on `../logand.app`
for how things should be done. It's the "golden boy" that you should copy (except
how the frontend looks obviously.)

## Status

Scaffolded: design docs ([docs/design/](docs/design/README.md)), stub
trees for `backend/` and `frontend/`, compose/CI/ops -- all interfaces
specified, no feature implementation yet. Build order and the live
checklist are in [TODO.md](TODO.md). The **public landing page is the
first real deliverable**; the admin/business app is a **mockup** for
now -- we're still discovering what functionality Mel actually needs
(see Open questions and [docs/design/14-admin-mockup.md](docs/design/14-admin-mockup.md)).

## Layout

```
backend/      Python / FastAPI / pydantic / typani -- API, auth, business logic
frontend/     TypeScript / React / Tailwind / Vite -- public site + admin SPA
docs/design/  pre-implementation specs, read by component
docs/         deployment / secrets / usage guides
ops/          VPS-side tooling (backups, release-watch)
.github/      CI (every PR) + deploy (push to main)
```

Hosting mirrors `logand.app`: single Hetzner VPS, Caddy in front, Docker
Compose for backend + Postgres, Cloudflare for DNS and R2 for media
(range video, course PDFs, waiver templates). Each subproject is
independently buildable via its own `Makefile`; the root `Makefile`
composes them.

## The landing page (headline interaction)

The hero is a slow-motion firing sequence behind the `MEL PINO` wordmark:

- **Cursor-reactive scrub.** Horizontal cursor position scrubs the
  slow-mo clip -- move right, the shot advances; move left, it reverses --
  with ease-in/ease-out so it never feels linear or twitchy. Idle state
  drifts slowly on its own.
- **Reactive wordmark.** On the "shot," the title shatters into fragments
  in slow-mo and recombines as the sequence settles -- a
  break-apart/reassemble cycle tied to the same scrub timeline, not a
  loop on a fixed timer.
- Must degrade gracefully: reduced-motion users get a static hero;
  the scrub is progressive enhancement, never required to read the page.

Open implementation question below (video-scrub vs. simulated). This is
the piece worth prototyping first and in isolation.

## Admin / business app (mockup scope)

Imagined, not committed -- to be pared down with Mel:

- **Scheduling** -- class sessions, seat capacity, student self-booking,
  waitlists, calendar view for Mel.
- **Invoicing** -- per-student and per-class invoices, deposits,
  paid/unpaid tracking. (Reuse `logand.app`'s payment-provider
  abstraction + PDF invoice generation rather than reinventing.)
- **Rosters & records** -- student list, course completion, cert
  issuance, signed-waiver storage (R2).
- **Utilities** -- range/ammo inventory, income reporting, reminder
  emails/SMS for upcoming classes.

## Quick start (once scaffolded)

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres (+ redis if needed)
cp backend/.env.example backend/.env              # fill in real values, never commit
make install
make check                                          # lint + typecheck + tests
```

Frontend dev server: `cd frontend && npm run dev`.
Backend dev server: `cd backend && uv run melpino-backend`.

## Secrets

Never commit `.env`. Real values go in `backend/.env` (gitignored) and in
GitHub Actions repo secrets. No agent in this repo reads `.env` directly
or indirectly. Per-secret detail goes in `docs/secrets.md`.

## Open questions (for Mel / to resolve)

- **Business name & domain** -- is "Mel Pino" the public brand, or a
  DBA/company name on top of it? What domain?
- **Landing hero** -- do we have a real slow-mo clip to license/shoot, or
  do we simulate the muzzle sequence? (Affects the whole hero approach --
  a real 240fps clip we can scrub, vs. a WebGL/canvas simulation.)
- **What does Mel actually book?** Fixed group classes on a calendar,
  1:1 appointments, or both? Drives the scheduling model.
- **Payments** -- take deposits online, or just track cash/in-person?
- **Legal** -- waiver e-signing, liability text, age/eligibility gating,
  and any jurisdiction rules for advertising firearms instruction.
- **Content** -- course catalog, pricing, Mel's bio/credentials, photos.

## Current Answers

- **Name**: Create "Mel Pino, LLC." (shortname: Mel Pino) as the name,
  however, make it VERY EASILY configurable in case this changes.
- **Landing Hero**: Simulate it first, but when we get slow-mo footage of
  him firing, it needs to be easy to replace. Make both options look professional
- **Bookings**: Mel does both; usually groups, 1-on-1 is a premium. There are
  both classes (where he teaches law and does a sim-gun demo) and groups classes.
  make an end-user interface where it's easy to book but secure. MAKE IT AS
  EASY AS POSSIBLE. I'VE HELPED TEACH 10+ CLASSES AND MOST PEOPLE ARE
  THE MOST TECH-ILLITERATE OLD PEOPLE YOU HAVE EVER SEEN.
- **Payments**: We need support (admin panel) to accept payments in person, but
  make support for Stripe, Paypal, Zelle (refer to ../logand.app project)
- **Legal**: This is mostly just for advertising and booking; a lot of the compliance
  happens in person, but if its free or required by Clearwater/Florida/Federal Law, include
  it; have disclaimers and whatnot.
- **Content**: Have a mock-content (CLEARLY MARKED) that we can go back in and extend
  later on.


## License

This is a private client project, but start out with MIT license, and we can reduce
scope later if needed.
