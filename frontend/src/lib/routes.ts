// Public-route manifest -- docs/design/10-seo-and-content.md section 2 (the
// public IA) and docs/design/07-frontend-architecture.md's "public site
// must serve real HTML" note. Single source of truth for:
//   - scripts/prerender.mjs (which routes to statically render + list in
//     sitemap.xml);
//   - the entry-server.tsx SSR helper (per-route title/description/JSON-LD).
// Admin routes are deliberately excluded -- they stay client-rendered
// behind auth, no SEO surface (doc 10 section 3).

import { CONTENT } from "../content/mock";

export interface PublicRouteMeta {
  path: string;
  title: string;
  description: string;
}

/** Every public, unauthenticated, crawlable route -- doc 10 section 2's
 * route list plus one entry per mock course slug (content/mock.ts). */
export function publicRoutes(): PublicRouteMeta[] {
  const routes: PublicRouteMeta[] = [
    { path: "/", title: CONTENT.meta.landing.title, description: CONTENT.meta.landing.description },
    { path: "/courses", title: CONTENT.meta.courses.title, description: CONTENT.meta.courses.description },
    { path: "/gallery", title: CONTENT.meta.gallery.title, description: CONTENT.meta.gallery.description },
    { path: "/about", title: CONTENT.meta.about.title, description: CONTENT.meta.about.description },
    { path: "/contact", title: CONTENT.meta.contact.title, description: CONTENT.meta.contact.description },
    { path: "/book", title: CONTENT.meta.book.title, description: CONTENT.meta.book.description },
  ];

  for (const course of CONTENT.courses) {
    routes.push({
      path: `/courses/${course.slug}`,
      title: `${course.name} -- Courses`,
      description: course.shortDescription,
    });
  }

  for (const legalPage of CONTENT.legalPages) {
    const meta = CONTENT.meta.legal[legalPage.slug];
    routes.push({ path: `/legal/${legalPage.slug}`, title: meta.title, description: meta.description });
  }

  return routes;
}
