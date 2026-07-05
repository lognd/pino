// ---------------------------------------------------------------------------
// MEDIA MANIFEST -- docs/design/15-media-and-gallery.md (binding).
//
// Single source of truth for every image/video shown in the carousel, the
// gallery grid, and the Landing "from the range" strip. Same SAMPLE-marked,
// one-file-to-swap discipline as content/mock.ts (doc 10 section 1): until
// real photos/footage exist, every entry points at a solid-color SVG
// stand-in under /local-media/ with SAMPLE text baked in, so the components
// are fully exercised. Swapping in real media = editing THIS ONE FILE:
//   - in dev, `src`/`thumb` are /local-media/ paths served by Vite;
//   - in production, they become full R2 public URLs under the `gallery/`
//     namespace (doc 15's "Serving through R2"), emitted by
//     ops/sync_public_media.py once the P7 bucket exists.
//
// The video entry below deliberately points `src` at a placeholder path that
// does NOT resolve to a real file yet -- ClickToPlayVideo must degrade to a
// plain-words "not available" message rather than a broken player (doc 15's
// click-to-play contract + graceful-failure requirement). Its `thumb` is a
// real poster SVG, the only thing loaded before a play click.
// ---------------------------------------------------------------------------

/** One piece of gallery media -- doc 15's MediaItem shape, verbatim. */
export interface MediaItem {
  kind: "image" | "video";
  /** Full URL (R2 public base + key) in production, or a /local-media/ path
   * in dev. For a video this is only fetched AFTER a play click. */
  src: string;
  /** ALWAYS present; for a video it is the ONLY thing loaded pre-click. */
  thumb: string;
  /** Required, non-empty -- the a11y gate (assertAllAltNonEmpty below). */
  alt: string;
  caption?: string;
  aspect: "landscape" | "portrait" | "square";
}

/** aspect-ratio CSS value per manifest `aspect` -- THE one mapping (used by
 * LazyMedia and ClickToPlayVideo) so every box reserves space the same way. */
export const ASPECT_RATIO: Record<MediaItem["aspect"], string> = {
  landscape: "16 / 9",
  portrait: "3 / 4",
  square: "1 / 1",
};

// Base for media URLs. Empty in dev (paths below are already absolute
// /local-media/ URLs Vite serves). A real deploy sets VITE_MEDIA_BASE_URL to
// the R2 public base (e.g. https://files.example.com) so the same manifest
// keys resolve to gallery/ objects -- see ops/sync_public_media.py.
const MEDIA_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MEDIA_BASE_URL) ||
  "";

/** Prefixes a manifest path with the configured media base (no-op in dev). */
function mediaUrl(path: string): string {
  if (!MEDIA_BASE) return path;
  return `${MEDIA_BASE.replace(/\/+$/, "")}${path}`;
}

export const MEDIA: MediaItem[] = [
  {
    kind: "image",
    src: mediaUrl("/local-media/sample-range-01.svg"),
    thumb: mediaUrl("/local-media/sample-range-01.svg"),
    alt: "SAMPLE -- Students on a lit indoor range bay, seen from behind the firing line",
    caption: "SAMPLE -- On the range: a small group class in progress",
    aspect: "landscape",
  },
  {
    kind: "image",
    src: mediaUrl("/local-media/sample-range-02.svg"),
    thumb: mediaUrl("/local-media/sample-range-02.svg"),
    alt: "SAMPLE -- The instructor demonstrating a stance to a single student",
    caption: "SAMPLE -- One-on-one coaching on stance and grip",
    aspect: "portrait",
  },
  {
    kind: "image",
    src: mediaUrl("/local-media/sample-range-03.svg"),
    thumb: mediaUrl("/local-media/sample-range-03.svg"),
    alt: "SAMPLE -- A sim-gun safety demonstration during the classroom portion",
    caption: "SAMPLE -- Sim-gun demonstration in the law class",
    aspect: "square",
  },
  {
    kind: "image",
    src: mediaUrl("/local-media/sample-range-04.svg"),
    thumb: mediaUrl("/local-media/sample-range-04.svg"),
    alt: "SAMPLE -- The classroom set up for the concealed-carry law lecture",
    caption: "SAMPLE -- The classroom, set for a law lecture",
    aspect: "landscape",
  },
  {
    kind: "image",
    src: mediaUrl("/local-media/sample-range-05.svg"),
    thumb: mediaUrl("/local-media/sample-range-05.svg"),
    alt: "SAMPLE -- Close-up of a two-handed grip drill on the line",
    caption: "SAMPLE -- Grip fundamentals, up close",
    aspect: "portrait",
  },
  {
    kind: "image",
    src: mediaUrl("/local-media/sample-range-06.svg"),
    thumb: mediaUrl("/local-media/sample-range-06.svg"),
    alt: "SAMPLE -- Paper targets showing a tight group after a technique class",
    caption: "SAMPLE -- Results from a group technique class",
    aspect: "square",
  },
  {
    kind: "video",
    // Intentionally unresolved until real footage lands -- exercises
    // ClickToPlayVideo's graceful-failure path (doc 15).
    src: mediaUrl("/local-media/sample-class-clip.mp4"),
    thumb: mediaUrl("/local-media/sample-video-poster.svg"),
    alt: "SAMPLE -- A short clip from a live-fire technique class",
    caption: "SAMPLE -- Watch a class clip",
    aspect: "landscape",
  },
];

/** Featured subset for the gallery's top carousel -- first four items. */
export const FEATURED_MEDIA: MediaItem[] = MEDIA.slice(0, 4);

/** Small "from the range" strip on Landing -- 3 image items, linking out to
 * the full gallery (doc 15). Images only so Landing never mounts a player. */
export const RANGE_STRIP_MEDIA: MediaItem[] = MEDIA.filter((m) => m.kind === "image").slice(0, 3);

/** All copy for the media components + gallery page -- no component hardcodes
 * a user-facing string (doc 10 section 1). SAMPLE-marked where placeholder;
 * plain control labels are real UI text, not placeholders. */
export const MEDIA_COPY = {
  gallery: {
    heading: "SAMPLE -- From the Range",
    intro:
      "SAMPLE -- A look at the classroom, the range, and the classes. Real " +
      "photos and video will replace these placeholders.",
    gridHeading: "SAMPLE -- All photos and video",
  },
  landingStrip: {
    heading: "SAMPLE -- From the range",
    linkLabel: "See the full gallery",
  },
  carousel: {
    regionLabel: "Photo and video carousel",
    prevLabel: "Previous",
    nextLabel: "Next",
    // {current} and {total} are replaced at render -- kept as one template
    // so the "N of M" phrasing lives in one place (doc 15's counter rule).
    counterTemplate: "{current} of {total}",
    thumbSelectTemplate: "Show item {current} of {total}",
  },
  video: {
    playLabel: "Play video",
    unavailableMessage:
      "SAMPLE -- This video is not available yet. Real class footage will " +
      "be added here. Call us if you have any questions.",
  },
  lightbox: {
    dialogLabel: "Photo viewer",
    closeLabel: "Close photo",
  },
} as const;

/** Fills the {current}/{total} counter template -- one formatter so the
 * carousel and the thumbnail rail never phrase the counter differently. */
export function formatCounter(template: string, current: number, total: number): string {
  return template.replace("{current}", String(current)).replace("{total}", String(total));
}

/** Throws if any manifest item has an empty/whitespace alt -- the a11y gate
 * (doc 15). Called by the manifest unit test; safe to call at startup too. */
export function assertAllAltNonEmpty(items: readonly MediaItem[] = MEDIA): void {
  for (const item of items) {
    if (item.alt.trim().length === 0) {
      throw new Error(`media manifest: empty alt on item with src=${item.src}`);
    }
  }
}
