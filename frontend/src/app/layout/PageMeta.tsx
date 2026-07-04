// Per-route <title>/description/canonical/OG/Twitter updates --
// docs/design/10-seo-and-content.md section 3. CRIB:
// logand.app/frontend/src/app/layout/usePageMeta.ts for the
// setMetaTag/setCanonical DOM-patching implementation; port as a hook
// (this file exports the hook, named PageMeta per the scaffold spec's
// layout file list, but the pattern is a hook, not a component).
//
// TODO(impl): docs/design/10-seo-and-content.md

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
}

export function usePageMeta(_meta: PageMetaInput): void {
  throw new Error("TODO(impl): docs/design/10-seo-and-content.md");
}
