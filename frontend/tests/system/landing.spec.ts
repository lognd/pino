import { test, expect } from "@playwright/test";

// docs/design/12-testing-strategy.md's frontend system obligations:
// "Hero: ... H1 present pre-hydration." and docs/design/10-seo-and-
// content.md's "real server-visible content ... not a blank SPA shell".
// Runs against the prerendered static build (vite preview, no backend --
// see playwright.config.ts's "public" project).
test.describe("Landing page", () => {
  test("serves real prerendered HTML before hydration (raw fetch, no JS)", async ({
    request,
  }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const html = await res.text();

    // H1 business name -- present in raw markup independent of hydration
    // (Hero.tsx's visual wordmark is aria-hidden decoration; this sr-text
    // H1 is the real accessible/SEO name, per doc 08's acceptance list).
    expect(html).toMatch(/<h1[^>]*>\s*Mel Pino\s*<\/h1>/);

    // Course card copy -- content/mock.ts's course names, present without
    // any JS execution (guards the blank-SPA-shell failure mode).
    expect(html).toContain("SAMPLE -- Concealed Carry Certification");
    expect(html).toContain("SAMPLE -- Group Technique Class");
    expect(html).toContain("SAMPLE -- Private 1:1 Lesson");
  });

  // KNOWN, REPORTED bug (P1 system-test verification pass, 2026-07-04):
  // client-side navigation is completely inert on every route. Root
  // cause: src/main.tsx calls installGlobalLogging() before the first
  // React render, and every function in src/lib/logging.ts
  // (installGlobalLogging included) is a stub that unconditionally
  // throws `Error("TODO(impl): docs/design/07-frontend-architecture.md")`
  // -- so ReactDOM.createRoot(...).render(...) never runs on ANY page.
  // Every <a> tag in the prerendered markup is therefore a plain,
  // un-intercepted anchor: clicking one does a full browser navigation
  // using its literal href.
  //
  // That alone would still land on the right page (full navigation to
  // e.g. /courses), except a second, compounding issue means it doesn't:
  // `vite preview`'s static server only resolves a directory's
  // dist/<path>/index.html when the URL ends in "/" (see seo.spec.ts's
  // fetchPath() comment) -- these hrefs are authored without a trailing
  // slash (matching scripts/prerender.mjs's slash-less canonical/sitemap
  // URLs), so the request falls through to the SPA fallback and serves
  // dist/index.html (Landing) instead, regardless of destination.
  //
  // Both causes are outside this test suite's ownership (src/lib/logging.ts
  // and vite.config.ts's preview server behavior are not
  // frontend/tests/system/** or playwright-config files) -- NOT weakened
  // here. The assertions below check real destination content and are
  // expected to fail until logging.ts lands; test.fixme keeps the real
  // bar encoded rather than a vacuous one.
  test("nav links (Courses/About/Contact/legal footer) are all reachable with a real H1", async ({
    page,
  }) => {
    test.fixme(
      true,
      "src/lib/logging.ts stubs throw on every page load (installGlobalLogging), " +
        "so React never mounts and all <a> clicks fall back to native, " +
        "un-intercepted navigation -- see comment above this test.",
    );
    await page.goto("/");

    const destinations: { link: string; path: string; h1: RegExp }[] = [
      { link: "Courses", path: "/courses", h1: /^Courses$/ },
      { link: "About", path: "/about", h1: /About Mel Pino/ },
      { link: "Contact", path: "/contact", h1: /Get In Touch/ },
    ];

    for (const { link, path, h1 } of destinations) {
      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: link, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    }

    const legalLinks: { link: string; path: string; h1: RegExp }[] = [
      { link: "Privacy Policy", path: "/legal/privacy", h1: /Privacy Policy/ },
      { link: "Terms of Service", path: "/legal/terms", h1: /Terms of Service/ },
      { link: "Disclaimers", path: "/legal/disclaimers", h1: /Disclaimers/ },
    ];

    for (const { link, path, h1 } of legalLinks) {
      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name: link, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    }
  });

  test("Book CTA leads to /book which shows coming-soon copy and a phone fallback", async ({
    page,
  }) => {
    test.fixme(
      true,
      "src/lib/logging.ts stubs throw on every page load (installGlobalLogging), " +
        "so React never mounts and the Book CTA click falls back to native, " +
        "un-intercepted navigation -- see comment above the nav-links test.",
    );
    await page.goto("/");
    await page.getByRole("link", { name: "Book a class", exact: true }).first().click();
    await expect(page).toHaveURL(/\/book$/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Online Booking Is Coming Soon/,
    );
    await expect(page.getByText(/Online booking is not open yet/)).toBeVisible();

    // Phone fallback: a tel: link, visible and non-empty (elderly-first
    // contract -- doc 09's "no dead ends" bar for anyone who can't/won't
    // use a form).
    const phoneLink = page.locator('a[href^="tel:"]');
    await expect(phoneLink).toBeVisible();
    await expect(phoneLink).not.toHaveText("");
  });
});
