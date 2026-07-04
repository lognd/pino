// Postbuild static-render step -- docs/design/07-frontend-architecture.md's
// "public site must serve real HTML" note and docs/design/10-seo-and-
// content.md section 3 ("Real server-visible content... sitemap.xml").
//
// Custom, dependency-free approach (no vite-plugin-prerender or similar):
// ~/projects/logand.app/frontend has no prerender step of its own to crib
// (checked its vite.config.ts, package.json scripts, and scripts/ dir --
// none exist there yet), so this implements the "ReactDOMServer SSR entry
// + StaticRouter" approach docs/design/07 names as the fallback plan.
//
// What it does, in order:
//   1. Runs a throwaway Vite SSR build of src/entry-server.tsx into
//      dist-ssr/ (Node-targeted ESM, JSX/TS handled by the same
//      @vitejs/plugin-react config as the real client build).
//   2. Imports that bundle and calls renderRoute(path)/routeJsonLd(path)
//      for every entry in the public route manifest (src/lib/routes.ts).
//   3. Splices each route's HTML into a copy of the already-built
//      dist/index.html (title/description/canonical/OG/Twitter/JSON-LD
//      swapped per route, #root filled with the rendered markup) and
//      writes it to dist/<path>/index.html (dist/index.html for "/").
//   4. Writes dist/sitemap.xml from the same manifest.
//   5. Deletes dist-ssr/ (build tooling only, never shipped).
//
// Must run AFTER `vite build` (dist/index.html and the client asset
// manifest must already exist) -- see package.json's "build" script.

import { build } from "vite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(FRONTEND_ROOT, "dist");
const SSR_OUT_DIR = path.join(FRONTEND_ROOT, "dist-ssr");
const SSR_ENTRY_FILE = "entry-server.mjs";

// Domain is undecided -- docs/design/00-overview.md's open question.
// VITE_PUBLIC_BASE_URL overrides this default at build time; until a real
// domain lands, sitemap.xml and robots.txt both point at this placeholder.
const SITE_BASE_URL = (process.env.VITE_PUBLIC_BASE_URL ?? "https://example.com").replace(/\/+$/, "");

async function buildSsrBundle() {
  await build({
    root: FRONTEND_ROOT,
    logLevel: "warn",
    build: {
      ssr: path.join(FRONTEND_ROOT, "src/entry-server.tsx"),
      outDir: "dist-ssr",
      emptyOutDir: true,
      rollupOptions: {
        output: { entryFileNames: SSR_ENTRY_FILE },
      },
    },
  });
}

function routeOutputPath(routePath) {
  if (routePath === "/") return path.join(DIST_DIR, "index.html");
  return path.join(DIST_DIR, routePath.replace(/^\//, ""), "index.html");
}

function escapeHtmlAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtmlText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMetaTag(attr, key, content) {
  return `<meta ${attr}="${key}" content="${escapeHtmlAttr(content)}" />`;
}

/** Patches the built index.html template for one route: swaps
 * title/description/canonical/OG/Twitter to the route's own values,
 * appends this route's JSON-LD script tags, and fills #root with the
 * SSR'd markup -- so a non-JS-executing crawler and a human on a slow
 * connection both see the real page immediately (docs/design/10 section
 * 3's "real server-visible content"). */
function renderPage(template, { route, html, jsonLd }) {
  const url = `${SITE_BASE_URL}${route.path}`;
  let page = template;

  page = page.replace(/<title>.*?<\/title>/s, `<title>${escapeHtmlText(route.title)}</title>`);
  page = page.replace(
    /<meta\s+name="description"[^>]*\/>/s,
    renderMetaTag("name", "description", route.description),
  );
  page = page.replace(/<link\s+rel="canonical"[^>]*\/>/s, `<link rel="canonical" href="${escapeHtmlAttr(url)}" />`);
  page = page.replace(/<meta\s+property="og:title"[^>]*\/>/s, renderMetaTag("property", "og:title", route.title));
  page = page.replace(
    /<meta\s+property="og:description"[^>]*\/>/s,
    renderMetaTag("property", "og:description", route.description),
  );
  page = page.replace(/<meta\s+property="og:url"[^>]*\/>/s, renderMetaTag("property", "og:url", url));
  page = page.replace(
    /<meta\s+name="twitter:title"[^>]*\/>/s,
    renderMetaTag("name", "twitter:title", route.title),
  );
  page = page.replace(
    /<meta\s+name="twitter:description"[^>]*\/>/s,
    renderMetaTag("name", "twitter:description", route.description),
  );

  const jsonLdTags = jsonLd
    .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry)}</script>`)
    .join("\n    ");
  if (jsonLdTags) {
    page = page.replace("</head>", `    ${jsonLdTags}\n  </head>`);
  }

  page = page.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  return page;
}

function buildSitemapXml(routes) {
  const urls = routes
    .map((route) => `  <url>\n    <loc>${escapeHtmlText(`${SITE_BASE_URL}${route.path}`)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function main() {
  const templatePath = path.join(DIST_DIR, "index.html");
  const template = await readFile(templatePath, "utf-8").catch((err) => {
    throw new Error(
      `prerender: dist/index.html not found (run \`vite build\` first) -- ${err.message}`,
    );
  });

  await buildSsrBundle();

  const ssrModule = await import(pathToFileURL(path.join(SSR_OUT_DIR, SSR_ENTRY_FILE)).href);
  const { publicRoutes, renderRoute, routeJsonLd } = ssrModule;

  const routes = publicRoutes();
  for (const route of routes) {
    const html = renderRoute(route.path);
    const jsonLd = routeJsonLd(route.path);
    const page = renderPage(template, { route, html, jsonLd });
    const outPath = routeOutputPath(route.path);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, page, "utf-8");
    console.log(`prerender: wrote ${path.relative(FRONTEND_ROOT, outPath)}`);
  }

  await writeFile(path.join(DIST_DIR, "sitemap.xml"), buildSitemapXml(routes), "utf-8");
  console.log(`prerender: wrote dist/sitemap.xml (base ${SITE_BASE_URL})`);

  await rm(SSR_OUT_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
