import { test, expect } from "@playwright/test";

// docs/design/14-admin-mockup.md's Playwright system test obligation:
// "/admin mockup loads only after passing the fake gate, and that a
// landed admin screen shows the banner... an unauthenticated visit to a
// deep /admin/... route is bounced back to the gate."
//
// Runs against the "admin" project (tests/system/playwright.config.ts):
// a dedicated dist-mock/ build (VITE_USE_MOCKS=true) served on its own
// port, entirely MSW-backed -- no live backend, no docker-compose. See
// that config's block comment for why this could not share the "public"
// project's prerendered-dist preview server (that build strips MSW and
// has no /admin routes prerendered).
test.describe("Admin mockup", () => {
  test("bounces an unauthenticated deep /admin/... visit back to the fake gate", async ({ page }) => {
    await page.goto("/admin/schedule");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("shows the MOCKUP -- SAMPLE DATA banner after passing the fake gate", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email address").fill("mel@example.com");
    await page.getByLabel("Password").fill("letmein");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("status")).toHaveText("MOCKUP -- SAMPLE DATA");

    await page.getByRole("link", { name: "Schedule" }).click();
    await expect(page).toHaveURL(/\/admin\/schedule$/);
    await expect(page.getByRole("status")).toHaveText("MOCKUP -- SAMPLE DATA");

    await page.getByRole("link", { name: /SAMPLE/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/schedule\/session-\d+$/);
    await expect(page.getByRole("status")).toHaveText("MOCKUP -- SAMPLE DATA");
    await expect(page.getByText("Roster", { exact: true })).toBeVisible();
  });
});
