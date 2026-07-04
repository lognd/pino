# 07 -- Frontend Architecture

Audience: anyone building the TypeScript frontend shell, routing, or
API client. Read [00-overview.md](00-overview.md) first. Visuals live
in [09-design-system.md](09-design-system.md); the hero has its own
doc ([08-landing-hero.md](08-landing-hero.md)). Structure mirrors
logand.app's `docs/design/07-frontend-architecture.md` -- differences
only, below.

## Stack (identical to logand.app)

React 18 + Vite + TypeScript strict; Tailwind + CSS-variable tokens;
React Router; TanStack Query; React Hook Form + zod; Motion for the
orchestrated moments; Vitest + React Testing Library + Playwright;
MSW (here it is not just a test tool -- it powers the admin mockup,
see [14-admin-mockup.md](14-admin-mockup.md)). Type sharing via
`openapi-typescript` generating `src/types/api.generated.ts` from the
backend's OpenAPI JSON, committed + drift-checked in CI (`make types`).

## Directory structure

```
frontend/src/
  main.tsx / App.tsx
  app/
    routes/
      public/            # Landing, Courses, CourseDetail, About,
                         # Contact, Book (3-step flow, see 04),
                         # ManageBooking, Pay, Legal (privacy/terms/
                         # disclaimers, see 06)
      admin/             # the MOCKUP SPA -- see 14; all data via MSW
    layout/              # Shell, AdminGuard, ErrorBoundary, PageMeta
  hero/                  # the landing hero module -- see 08. Isolated
                         # on purpose: prototype-first, zero imports
                         # from app/ so it can be developed standalone.
  components/            # shared UI -- BigButton, Field, Stepper,
                         # StatusBadge, PhoneFallbackNote, SampleBanner
  api/                   # client.ts + one file per backend feature
                         # (courses.ts, bookings.ts, invoices.ts, auth.ts,
                         #  config.ts)
  content/mock.ts        # ALL public copy, SAMPLE-marked -- see 10
  mocks/                 # MSW: browser.ts, handlers.ts, data.ts -- see 14
  lib/                   # brand.ts (see 00), logging.ts, time.ts
  styles/                # tokens.css, tailwind.css
  types/api.generated.ts
```

## API client rules (copy logand's client.ts)

Single fetch chokepoint: attaches `X-CSRF-Token` on mutations (admin
surface only -- guest routes are CSRF-exempt by design, see 02),
handles 401 (admin -> login redirect), 429 (typed RateLimitedError
with Retry-After so the booking flow can show "please wait N seconds"
in plain words), and branches on the backend's machine-readable
`code` field, never on detail prose. Guest manage/pay tokens travel
in the URL path only -- never persisted to localStorage/sessionStorage.

## Route guards

`/admin/*` wraps in AdminGuard (`GET /api/auth/me` via Query). During
the mockup phase the guard consults the fake MSW login (see 14) --
same component, swapped data source, so graduation costs nothing.
Public routes have no guards; ManageBooking/Pay resolve their token
server-side and render the 404 state in friendly language ("this link
has expired -- call us and we will sort it out").

## Two entry concerns that are NOT generic SPA defaults

1. **The public site must serve real HTML** (SEO + the elderly bar --
   a blank shell on slow devices is a failure): prerender public
   routes at build time (vite-plugin-prerender or equivalent
   static-render step; logand.app prerenders similarly -- crib its
   approach). The admin mockup stays a plain SPA.
2. **The hero must not tax the rest of the page**: `hero/` is
   lazy-loaded (`import()`) behind a static poster fallback, so
   Landing's LCP never waits on simulation code
   ([08-landing-hero.md](08-landing-hero.md) owns the budget).

## Makefile / scripts

Copy logand's frontend Makefile verbatim (install/dev/build/test/
test-system/lint/fmt/typecheck/check/types/clean). package.json
scripts likewise, plus `dev:mock` (VITE_USE_MOCKS=true) which the
admin mockup uses.

## Test obligations

Copy logand's split (Vitest unit, integration against the real test
backend, Playwright system). Melpino-specific minimums live in
[12-testing-strategy.md](12-testing-strategy.md): the 3-step booking
flow, manage/cancel journey, hero reduced-motion fallback, axe scans
with the elderly-first bar, mock-content SAMPLE-marker guard.

## What NOT to put here

- Visuals/tokens/type -> [09-design-system.md](09-design-system.md)
- Hero internals -> [08-landing-hero.md](08-landing-hero.md)
- Copy/SEO -> [10-seo-and-content.md](10-seo-and-content.md)
- Admin mockup mechanics -> [14-admin-mockup.md](14-admin-mockup.md)
