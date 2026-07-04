// Per-route <title>/description/canonical/OG/Twitter updates --
// docs/design/10-seo-and-content.md section 3. Patches document.title and
// the meta tags that already exist as literal defaults in index.html (see
// that file's own comment) so each route overrides them client-side. Real
// build-time prerendering is a later SEO task (see index.html's TODO);
// until then this hook is what makes each route's <title> and description
// distinct for a JS-executing crawler and for the browser tab.

import { useEffect } from "react";

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
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

export function usePageMeta({ title, description, path }: PageMetaInput): void {
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
  }, [title, description, path]);
}
