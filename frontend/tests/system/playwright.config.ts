import { defineConfig, devices } from "@playwright/test";

// P1 system suite runs BACKEND-FREE against the prerendered static build:
// `npm run build` writes dist/ (vite build + scripts/prerender.mjs), then
// `vite preview` serves that dist/ as a plain static file server -- no
// backend, no docker-compose, no mocks. This matches docs/design/12's
// "public site must serve real HTML" system obligations that do not
// depend on the API (landing/a11y/hero/seo specs).
//
// Booking/payment/admin journeys (guest-booking-journey.spec.ts,
// admin-mockup.spec.ts) are later phases that DO need a live backend --
// they stay under the "fullstack" project below (currently unused by any
// spec; wire it to docker-compose.test.yml + PLAYWRIGHT_BASE_URL pointing
// at a dev-server-backed origin when that phase lands, per
// docs/design/12-testing-strategy.md). Splitting by project now means
// that work never has to touch this config's "public" half.
const PUBLIC_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";

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
      // Placeholder for backend-dependent P2+ specs (guest-booking-journey,
      // admin-mockup). Not run by default -- no webServer/backend wired up
      // yet. Give it its own baseURL env var when that phase starts so it
      // never collides with the public project's static preview server.
      name: "fullstack",
      testMatch: ["guest-booking-journey.spec.ts", "admin-mockup.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.PLAYWRIGHT_FULLSTACK_BASE_URL,
      },
    },
  ],
  webServer: {
    // Serves the already-built dist/ -- run `npm run build` first (the
    // Makefile/CI order: build then test-system). No dev server, no API,
    // no mocks: this is the real static output a crawler/user would get.
    command: "npm run preview -- --port 4173 --strict-port",
    url: PUBLIC_BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
