import { defineConfig, devices } from "@playwright/test";

// P1 system suite runs BACKEND-FREE against the prerendered static build:
// `npm run build` writes dist/ (vite build + scripts/prerender.mjs), then
// `vite preview` serves that dist/ as a plain static file server -- no
// backend, no docker-compose, no mocks. This matches docs/design/12's
// "public site must serve real HTML" system obligations that do not
// depend on the API (landing/a11y/hero/seo specs).
//
// Booking/payment journeys against a REAL backend (guest-booking-journey.spec.ts)
// run under the "fullstack" project below: a plain `vite build` (no tsc
// gate, no prerender needed for this project) + `vite preview`, which
// DOES honor vite.config.ts's server.proxy for /api (confirmed against
// this vite version) -- so api/client.ts's relative "/api/..." fetches
// reach a real backend via VITE_API_PROXY_TARGET. Deliberately NOT `vite
// dev`: this vite version's dev-mode transform is stricter about JSX
// text than its production (esbuild) build path and currently trips over
// a pre-existing src/hero/** issue unrelated to booking (out of scope
// here, hero/** internals are owned by another agent) -- `vite build`
// sidesteps it entirely since it uses the more lenient transform. This
// host has no docker-compose plugin (see docs/design/12 and P2's
// verification note), so the backend side of "fullstack" is stood up by
// hand: `docker run postgres:16-alpine` + `alembic upgrade head` +
// `uvicorn melpino_backend.asgi:app`, matching backend/tests/conftest.py's
// _pg_url fixture's image choice. Set PLAYWRIGHT_FULLSTACK_BASE_URL and
// VITE_API_PROXY_TARGET to point at that stack; the project is a no-op
// (skipped specs) if PLAYWRIGHT_FULLSTACK_BASE_URL is unset.
//
// admin-mockup.spec.ts is DIFFERENT: docs/design/14-admin-mockup.md's
// mockup talks to MSW only, never a live backend, so it does not belong
// in "fullstack" (that project has no webServer and would hang forever
// waiting for a backend that will never come up). It gets its own "admin"
// project + preview server instead: `npm run build:mock` produces a
// second, separate build (dist-mock/, VITE_USE_MOCKS=true, no prerender --
// the admin SPA has no SEO surface per doc 14) and `vite preview` serves
// it on its own port so it never collides with the "public" project's
// dist/ preview server. Splitting by project this way means neither
// project's build step touches the other's output directory.
const PUBLIC_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const ADMIN_BASE_URL = process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? "http://localhost:4174";
const FULLSTACK_BASE_URL = process.env.PLAYWRIGHT_FULLSTACK_BASE_URL;
const FULLSTACK_PORT = FULLSTACK_BASE_URL ? new URL(FULLSTACK_BASE_URL).port || "5175" : "5175";

export default defineConfig({
  testDir: ".",
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: 10_000 },
  use: {
    baseURL: PUBLIC_BASE_URL,
  },
  projects: [
    {
      name: "public",
      testMatch: [
        "landing.spec.ts",
        "a11y.spec.ts",
        "hero.spec.ts",
        "seo.spec.ts",
        "gallery.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // MSW-only admin mockup smoke test -- see the block comment above.
      name: "admin",
      testMatch: ["admin-mockup.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: ADMIN_BASE_URL,
      },
    },
    {
      // Guest booking journey against a REAL backend -- see the block
      // comment above. No-op (no tests actually run) unless
      // PLAYWRIGHT_FULLSTACK_BASE_URL is set, so this project never hangs
      // waiting for a backend in the default `npm run test:system` run.
      name: "fullstack",
      testMatch: ["guest-booking-journey.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: FULLSTACK_BASE_URL,
      },
    },
  ],
  webServer: [
    {
      // Serves the already-built dist/ -- run `npm run build` first (the
      // Makefile/CI order: build then test-system). No dev server, no API,
      // no mocks: this is the real static output a crawler/user would get.
      command: "npm run preview -- --port 4173 --strict-port",
      url: PUBLIC_BASE_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Builds dist-mock/ (VITE_USE_MOCKS=true, no prerender) then serves
      // it -- MSW-backed admin SPA only; see the "admin" project above.
      // Built here (not by package.json's plain "build" script) so
      // `npm run test:system` alone produces both builds it needs, with
      // no separate build:mock step for CI/verify to remember.
      command: "npm run build:mock && npm run preview:mock",
      url: ADMIN_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // Only started when PLAYWRIGHT_FULLSTACK_BASE_URL is set (see above) --
    // plain `vite build` (no tsc gate) + `vite preview`, whose proxy
    // forwards /api to VITE_API_PROXY_TARGET. Own dist-fullstack/ output
    // dir so it never collides with the "public"/"admin" projects' builds.
    ...(FULLSTACK_BASE_URL
      ? [
          {
            command:
              `npm run build:fullstack && ` +
              `npm run preview:fullstack -- --port ${FULLSTACK_PORT} --strict-port`,
            url: FULLSTACK_BASE_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
          },
        ]
      : []),
  ],
});
