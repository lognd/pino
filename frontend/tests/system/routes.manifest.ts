// Mirror of src/lib/routes.ts's publicRoutes() manifest for the P1 system
// suite. NOT a direct import: routes.ts -> content/mock.ts -> lib/brand.ts
// reads `import.meta.env.*`, which only exists under Vite's transform: a
// plain Playwright/Node test runner has no `import.meta.env` and the
// import would throw at load time. Keep this list in lockstep with
// src/lib/routes.ts's publicRoutes() by hand -- both are short and
// change together (new course/legal page = new entry in both places).
//
// jsonLd: what docs/design/10-seo-and-content.md section 3 requires for
// this route ("none" for About/Book/legal -- routeJsonLd() in
// entry-server.tsx returns [] for those on purpose).
export interface ManifestRoute {
  path: string;
  jsonLd: "LocalBusiness" | "Course" | "ImageGallery" | "none";
}

export const PUBLIC_ROUTES: ManifestRoute[] = [
  { path: "/", jsonLd: "LocalBusiness" },
  { path: "/courses", jsonLd: "Course" },
  { path: "/gallery", jsonLd: "ImageGallery" },
  { path: "/about", jsonLd: "none" },
  { path: "/contact", jsonLd: "LocalBusiness" },
  { path: "/book", jsonLd: "none" },
  { path: "/courses/concealed-carry-certification", jsonLd: "Course" },
  { path: "/courses/group-technique-class", jsonLd: "Course" },
  { path: "/courses/private-lesson", jsonLd: "Course" },
  { path: "/legal/privacy", jsonLd: "none" },
  { path: "/legal/terms", jsonLd: "none" },
  { path: "/legal/disclaimers", jsonLd: "none" },
];
