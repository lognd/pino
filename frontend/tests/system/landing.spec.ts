import { test } from "@playwright/test";

// docs/design/12-testing-strategy.md's frontend system obligations:
// "Hero: reduced-motion poster rung; H1 present pre-hydration." and
// "SEO: every public route serves non-empty meaningful HTML + valid
// JSON-LD."
test.describe("Landing page", () => {
  test.skip("renders the H1 with the business name before the hero JS chunk loads", async () => {
    // TODO(impl): docs/design/08-landing-hero.md
  });
  test.skip("prefers-reduced-motion renders the poster with no scrub/drift/shatter", async () => {
    // TODO(impl): docs/design/08-landing-hero.md
  });
  test.skip("serves non-empty meaningful HTML without JS execution", async () => {
    // TODO(impl): docs/design/10-seo-and-content.md
  });
  test.skip("embeds valid LocalBusiness JSON-LD", async () => {
    // TODO(impl): docs/design/10-seo-and-content.md
  });
});
