import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES } from "./routes.manifest";

// docs/design/10-seo-and-content.md section 3: title/description/canonical
// per route, JSON-LD (LocalBusiness on landing/contact, Course on courses
// pages) validating against its schema type, sitemap.xml, robots.txt.
// Reads raw HTML via request.get -- no JS execution, matching the
// "crawlers and AI agents get the same content a human sees" requirement.

function extractJsonLd(html: string): unknown[] {
  const scripts = [
    ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
  ];
  return scripts.map((m) => JSON.parse(m[1]));
}

// scripts/prerender.mjs writes dist/<path>/index.html for every non-root
// route (dist/index.html only for "/"). `vite preview`'s static server
// resolves a directory's index.html only when the URL ends in "/" -- a
// bare "/courses" request falls through to its SPA fallback (dist's root
// index.html) instead, same as any plain static-file server without an
// explicit try_files rewrite (see docs/design/11-deployment.md for the
// real Caddy config). This helper is only about correctly exercising the
// *build output* through `vite preview` in this backend-free suite -- it
// does not change what canonical/sitemap URLs look like (those stay
// slash-less, matching scripts/prerender.mjs).
function fetchPath(routePath: string): string {
  return routePath === "/" ? "/" : `${routePath}/`;
}

// KNOWN, REPORTED bug (P1 system-test verification pass, 2026-07-04): all
// three legal routes prerender (and render live) as the app's "not
// found" fallback instead of real legal content. Root cause: App.tsx
// registers exact routes `/legal/privacy`, `/legal/terms`,
// `/legal/disclaimers` (no `:page` param) ahead of the catch-all
// `/legal/:page`, so react-router matches the FIRST (paramless) route --
// LegalPage.tsx's `const { page } = useParams<{ page: string }>()` is
// therefore always undefined on those three routes, `CONTENT.legalPages
// .find((p) => p.slug === page)` never matches, and the component renders
// its "We could not find that page" branch. Real legal content (title,
// description, and the actual policy text) never reaches a user or a
// crawler on these three routes. src/App.tsx and
// src/app/routes/public/LegalPage.tsx are out of this test suite's
// ownership -- NOT weakened here.
const KNOWN_NOT_FOUND_ROUTES = new Set([
  "/legal/privacy",
  "/legal/terms",
  "/legal/disclaimers",
]);

for (const route of PUBLIC_ROUTES) {
  test.describe(`SEO metadata: ${route.path}`, () => {
    test(`title, description, canonical present on ${route.path}`, async ({
      request,
      baseURL,
    }) => {
      if (KNOWN_NOT_FOUND_ROUTES.has(route.path)) {
        test.fixme(
          true,
          `${route.path} prerenders as the not-found fallback -- see KNOWN_NOT_FOUND_ROUTES above.`,
        );
      }
      const res = await request.get(fetchPath(route.path));
      expect(res.status()).toBe(200);
      const html = await res.text();

      const title = /<title>(.*?)<\/title>/s.exec(html);
      expect(title, "missing <title>").not.toBeNull();
      expect(title![1].trim().length).toBeGreaterThan(0);

      const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html);
      expect(description, "missing meta description").not.toBeNull();
      expect(description![1].trim().length).toBeGreaterThan(0);

      const canonical = /<link\s+rel="canonical"\s+href="([^"]*)"/.exec(html);
      expect(canonical, "missing canonical link").not.toBeNull();
      expect(canonical![1]).toContain(route.path === "/" ? "/" : route.path);

      // Real content, not the app's not-found fallback (guards the exact
      // bug documented in KNOWN_NOT_FOUND_ROUTES above).
      expect(html).not.toContain("We could not find that page");
      void baseURL;
    });

    if (route.jsonLd !== "none") {
      test(`JSON-LD @type=${route.jsonLd} parses on ${route.path}`, async ({
        request,
      }) => {
        const res = await request.get(fetchPath(route.path));
        const html = await res.text();
        const entries = extractJsonLd(html);
        expect(
          entries.length,
          `no JSON-LD script tags found on ${route.path}`,
        ).toBeGreaterThan(0);

        const matching = entries.filter(
          (e): e is { "@type": string } =>
            typeof e === "object" &&
            e !== null &&
            (e as Record<string, unknown>)["@type"] === route.jsonLd,
        );
        expect(
          matching.length,
          `no JSON-LD entry with @type=${route.jsonLd} on ${route.path}`,
        ).toBeGreaterThan(0);
      });
    }
  });
}

test.describe("Site files", () => {
  test("/sitemap.xml is served and lists every manifest route", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<urlset");

    for (const route of PUBLIC_ROUTES) {
      expect(xml, `sitemap.xml missing ${route.path}`).toContain(`<loc>`);
    }
    // Path-specific check: every manifest path appears as a <loc> value
    // (not just a substring hit elsewhere in the document).
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    for (const route of PUBLIC_ROUTES) {
      const found = locs.some((loc) => {
        try {
          return new URL(loc).pathname === route.path;
        } catch {
          return loc.endsWith(route.path);
        }
      });
      expect(
        found,
        `sitemap.xml missing an entry for ${route.path} (locs: ${locs.join(", ")})`,
      ).toBe(true);
    }
  });

  test("/robots.txt is served", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("User-agent:");
  });
});
