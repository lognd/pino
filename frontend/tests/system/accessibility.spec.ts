import { test } from "@playwright/test";

// docs/design/12-testing-strategy.md: "axe scan on every public page:
// zero critical/serious -- the elderly-first gate (09)."
test.describe("Accessibility (axe)", () => {
  test.skip("Landing has zero critical/serious axe violations", async () => {
    // TODO(impl): docs/design/09-design-system.md
  });
  test.skip("Book (booking flow) has zero critical/serious axe violations", async () => {
    // TODO(impl): docs/design/09-design-system.md
  });
});
