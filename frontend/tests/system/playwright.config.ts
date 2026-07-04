import { defineConfig, devices } from "@playwright/test";

// P1 system suite runs BACKEND-FREE against the prerendered static build:
// `npm run build` writes dist/ (vite build + scripts/prerender.mjs), then
// `vite preview` serves that dist/ as a plain static file server -- no
// backend, no docker-compose, no mocks. This matches docs/design/12's
// "public site must serve real HTML" system obligations that do not
// depend on the API (landing/a11y/hero/seo specs).
//
// Booking/payment journeys against a REAL backend (guest-booking-journey.spec.ts)
// are a later phase -- they stay under the "fullstack" project below
// (currently unused by any spec; wire it to docker-compose.test.yml +
// PLAYWRIGHT_FULLSTACK_BASE_URL pointing at a dev-server-backed origin
// when that phase lands, per docs/design/12-testing-strategy.md).
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
      testMatch: ["landing.spec.ts", "a11y.spec.ts", "hero.spec.ts", "seo.spec.ts"],
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
      // Placeholder for backend-dependent P2+ specs (guest-booking-journey).
      // Not run by default -- no webServer/backend wired up yet. Give it
      // its own baseURL env var when that phase starts so it never
      // collides with the public project's static preview server.
      name: "fullstack",
      testMatch: ["guest-booking-journey.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.PLAYWRIGHT_FULLSTACK_BASE_URL,
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
  ],
});
