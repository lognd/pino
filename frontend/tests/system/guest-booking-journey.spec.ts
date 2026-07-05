import { test, expect } from "@playwright/test";

// docs/design/12-testing-strategy.md's frontend system obligations:
// "Guest journey: browse courses -> book (attestation checked) -> ...
// confirmation link -> manage page -> cancel." and the "Full-session
// path" / "Deposit path" cases. Runs against a REAL backend (see
// playwright.config.ts's "fullstack" project) -- no fake-SMTP assertion
// here: the create-booking response returns `manage_url` directly
// (api/bookings.py's BookingCreateResponse, doc 04), so this journey
// drives the manage page from that response instead of parsing an email.
//
// This project only runs when PLAYWRIGHT_FULLSTACK_BASE_URL is set (see
// playwright.config.ts) -- the backend + Postgres are stood up by hand
// (no docker-compose plugin on this host, see P2's own verification
// note), seeded with one "Group Technique Class" course + one published
// session at capacity=2. Every test below assumes that seed.
test.describe("Guest booking journey", () => {
  test.describe.configure({ mode: "serial" });

  test("browses courses, books a class, confirms, then manages and cancels it", async ({ page }) => {
    await page.goto("/book");

    // Step 1: pick a class -> pick a session (plain-words seat count).
    await page.getByRole("button", { name: "Choose this class" }).click();
    await expect(page.getByText(/of \d+ seats open/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Select this session" }).first().click();

    // Step 2: your details.
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await page.getByLabel("Full name").fill("Jane Guest");
    await page.getByLabel("Email address").fill(`jane-${Date.now()}@example.test`);
    await page.getByLabel(/It is okay to text me reminders/).check();
    await page.getByLabel(/I have read and agree to the statement above/).check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: confirm -> Book.
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Book this class" }).click();

    // Confirmation: manage link + print affordance + "we emailed you" line.
    await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("We emailed you a link to manage this booking.")).toBeVisible();
    const manageLink = page.getByRole("link", { name: /\/booking\// });
    await expect(manageLink).toBeVisible();
    const manageUrl = await manageLink.getAttribute("href");
    expect(manageUrl).toBeTruthy();
    await expect(page.getByRole("button", { name: "Print this page" })).toBeVisible();

    // Manage page: real booking detail resolved via the manage token.
    await page.goto(manageUrl as string);
    await expect(page.getByRole("heading", { name: "Manage your booking" })).toBeVisible();
    await expect(page.getByText("Confirmed")).toBeVisible();
    await expect(page.getByText("Group Technique Class")).toBeVisible();

    // Cancel it.
    await page.getByRole("button", { name: "Cancel this booking" }).click();
    await expect(page.getByText("This booking has been cancelled.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("shows a friendly not-found state for a wrong/expired manage token", async ({ page }) => {
    await page.goto("/booking/this-token-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "We could not find that booking" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('a[href^="tel:"]')).toBeVisible();
  });

  test.skip(
    "joins a waitlist when a session is full, gets offered a seat on cancel",
    async () => {
      // TODO(impl): docs/design/04-booking-and-scheduling.md -- exercising
      // this end-to-end needs a *second* seeded session at capacity=1 (or
      // driving this same session past capacity first, which would race
      // against the other tests in this file for the shared seed data).
      // The waitlist-offer-on-cancel transition itself is covered by the
      // backend's own integration test (docs/design/04's "Test
      // obligations" -- "waitlist offer on cancellation picks
      // oldest-that-fits"); this spec only needs its own isolated fixture
      // data to add the UI-level assertion without flaking against the
      // other tests here.
    },
  );

  test.skip("pays a deposit course via fake-stripe and the invoice shows paid", async () => {
    // TODO(impl): docs/design/05-payments-and-invoicing.md -- the Pay
    // page itself (src/app/routes/public/Pay.tsx, src/api/pay.ts) is now
    // built against api/invoices_public.py's real /api/pay/{token}
    // contract, but this end-to-end path still needs two things this
    // pass could not provide: (1) a real backend + Postgres stood up by
    // hand for the "fullstack" project (see playwright.config.ts's own
    // note -- not done here since another agent's backend tree was being
    // edited concurrently, and this pass was told not to run backend
    // commands while that's true), and (2) seed data for a deposit-
    // bearing course/session (the current seed is one capacity=2 "Group
    // Technique Class" with no deposit) plus a fake-stripe webhook
    // fixture to actually settle the invoice. Un-skip once both exist.
  });
});
