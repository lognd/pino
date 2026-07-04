import { defineConfig, devices } from "@playwright/test";

// Requires the dev server (or a built preview server) running at baseURL.
// CRIB: logand.app/frontend/tests/system/playwright.config.ts. CI starts
// the full docker-compose.test.yml stack first -- see
// docs/design/12-testing-strategy.md.
export default defineConfig({
  testDir: ".",
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
