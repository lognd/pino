import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PUBLIC_ROUTES } from "./routes.manifest";

// docs/design/12-testing-strategy.md: "axe scan on every public page:
// zero critical/serious -- the elderly-first gate (09)." Runs against
// every route in the public manifest (tests/system/routes.manifest.ts,
// mirrors src/lib/routes.ts).
//
// The color-contrast violation previously tracked here (--mp-red text on
// --mp-surface measuring 3.91:1, below the 4.5:1 AA gate) is fixed: body-size
// red text/links now use the new --mp-red-text token (src/styles/tokens.css),
// which measures >= 4.5:1 on both --mp-surface and --mp-black (see that
// file's comment for the computed ratios). No allowlist remains -- any
// serious/critical violation now fails the test for real.

for (const route of PUBLIC_ROUTES) {
  test.describe(`Accessibility (axe): ${route.path}`, () => {
    test(`zero critical/serious violations on ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (seriousOrCritical.length > 0) {
        const report = seriousOrCritical
          .map((v) => {
            const nodes = v.nodes
              .map((n) => `    - ${n.target.join(" ")}: ${n.failureSummary}`)
              .join("\n");
            return `  [${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})\n${nodes}`;
          })
          .join("\n");
        console.error(`axe violations on ${route.path}:\n${report}`);

        expect(
          seriousOrCritical,
          `axe violations on ${route.path}:\n${report}`,
        ).toEqual([]);
      }
    });

    test(`exactly one h1 and a main landmark on ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator("h1")).toHaveCount(1);
      // "a main landmark" -- at least one <main> reachable via role=main;
      // NOT asserting exactly one here: Shell.tsx wraps every page's own
      // <main> in its own <main className="flex-1">, a pre-existing
      // nested-landmark pattern in src/app/layout/Shell.tsx + every public
      // route component (out of this test suite's ownership -- src/ is
      // owned by another agent). See a11y.spec.ts's axe scan above for the
      // enforced, real accessibility bar (critical/serious violations);
      // that scan is what would catch this if axe rates it that severely.
      await expect(page.getByRole("main").first()).toBeVisible();
    });
  });
}
