// Build-time SSR entry -- docs/design/07-frontend-architecture.md's "public
// site must serve real HTML" note. Consumed only by scripts/prerender.mjs
// (via a Vite SSR build), never imported by the browser bundle or by
// main.tsx -- keeps ReactDOMServer and StaticRouter out of the client
// chunk entirely.
//
// Uses the LEGACY renderToString (not renderToPipeableStream) on purpose:
// Landing lazy-loads the hero behind <Suspense> (see
// app/routes/public/Landing.tsx's own comment) and the hero module does
// real canvas/animation work that must never run at build time.
// renderToString synchronously renders each Suspense boundary's static
// fallback for a lazy import that has not resolved yet (a documented
// legacy-API behavior) -- exactly the "fallback + full page text, never
// canvas work" outcome docs/design/08 requires here. The newer streaming
// APIs wait for the lazy chunk to resolve instead, which is the wrong
// behavior for this one page.

import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { CONTENT } from "./content/mock";
import { buildLocalBusinessJsonLd, buildCourseJsonLd } from "./lib/jsonld";
import { publicRoutes, type PublicRouteMeta } from "./lib/routes";

export { publicRoutes };

/** Renders one route's App tree to a static HTML string for injection into
 * dist/index.html's #root div. No data fetching happens (public pages read
 * from content/mock.ts synchronously), so a single throwaway QueryClient is
 * enough -- it exists only because App/main.tsx's tree expects a provider
 * in context, not because any query actually runs during SSR. */
export function renderRoute(path: string): string {
  const queryClient = new QueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={path}>
        <App />
      </StaticRouter>
    </QueryClientProvider>,
  );
}

/** Structured data for one route -- mirrors the same routes' client-side
 * usePageMeta({ jsonLd }) calls (see PageMeta.tsx's own comment on why the
 * two must stay in lockstep), so a non-JS-executing crawler sees identical
 * JSON-LD to a JS-executing one. Returns [] for routes with no JSON-LD
 * (About, Book, legal pages -- doc 10 only requires LocalBusiness and
 * Course entries). */
export function routeJsonLd(path: string): object[] {
  if (path === "/" || path === "/contact") {
    return [buildLocalBusinessJsonLd(CONTENT.contact)];
  }
  if (path === "/courses") {
    return CONTENT.courses.map(buildCourseJsonLd);
  }
  const courseMatch = /^\/courses\/(.+)$/.exec(path);
  if (courseMatch) {
    const course = CONTENT.courses.find((c) => c.slug === courseMatch[1]);
    return course ? [buildCourseJsonLd(course)] : [];
  }
  return [];
}

export type { PublicRouteMeta };
