// Per-route <title>/description/canonical/OG/Twitter/JSON-LD updates --
// docs/design/10-seo-and-content.md section 3. Patches document.title and
// the meta tags that already exist as literal defaults in index.html (see
// that file's own comment) so each route overrides them client-side. This
// is the client-side (JS-executing crawler / browser tab) half of SEO
// metadata; scripts/prerender.mjs's entry-server.tsx duplicates the same
// title/description/JSON-LD values at build time (via the same
// content/mock.ts + lib/jsonld.ts sources) so a non-JS-executing crawler
// sees identical metadata in the prerendered static HTML.

import { useEffect } from "react";

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  /** Structured-data object(s) for this route (see lib/jsonld.ts). Each is
   * rendered into its own <script type="application/ld+json"> tag, tagged
   * with data-managed-jsonld so stale tags are cleared on route change. */
  jsonLd?: object | object[];
}

const JSONLD_MARKER_ATTR = "data-managed-jsonld";

function clearManagedJsonLd(): void {
  document.querySelectorAll(`script[${JSONLD_MARKER_ATTR}]`).forEach((node) => node.remove());
}

function appendJsonLd(entries: object[]): void {
  for (const entry of entries) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(JSONLD_MARKER_ATTR, "true");
    script.textContent = JSON.stringify(entry);
    document.head.appendChild(script);
  }
}

function setMetaTag(attr: "name" | "property", key: string, content: string): void {
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

export function usePageMeta({ title, description, path, jsonLd }: PageMetaInput): void {
  useEffect(() => {
    document.title = title;
    setMetaTag("name", "description", description);
    setMetaTag("property", "og:title", title);
    setMetaTag("property", "og:description", description);
    setMetaTag("name", "twitter:title", title);
    setMetaTag("name", "twitter:description", description);

    const origin =
      typeof window !== "undefined" && window.location ? window.location.origin : "https://example.com";
    const url = `${origin}${path}`;
    setMetaTag("property", "og:url", url);
    setCanonical(url);

    clearManagedJsonLd();
    if (jsonLd) {
      appendJsonLd(Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
    }
  }, [title, description, path, jsonLd]);
}
