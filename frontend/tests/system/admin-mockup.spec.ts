import { test } from "@playwright/test";

// docs/design/14-admin-mockup.md's Playwright system test obligation:
// "/admin mockup loads only after passing the fake gate, and that a
// landed admin screen shows the banner... an unauthenticated visit to a
// deep /admin/... route is bounced back to the gate."
test.describe("Admin mockup", () => {
  test.skip("bounces an unauthenticated deep /admin/... visit back to the fake gate", async () => {
    // TODO(impl): docs/design/14-admin-mockup.md
  });
  test.skip("shows the MOCKUP -- SAMPLE DATA banner after passing the fake gate", async () => {
    // TODO(impl): docs/design/14-admin-mockup.md
  });
});
