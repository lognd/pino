// Lazy image in a fixed-ratio box -- docs/design/15-media-and-gallery.md's
// lazy-loading rules: loading="lazy" + decoding="async" + an explicit
// aspect-ratio box so an image loading in never shifts layout (no CLS). The
// box's ratio comes from the manifest's `aspect` field, so a portrait shot
// and a landscape shot each reserve the right space before their bytes
// arrive. Hard-edged per doc 09 (radius 0, 2px border) -- no rounding.

import type { MediaItem } from "../content/media";

/** aspect-ratio CSS value per manifest `aspect` -- one mapping so every box
 * on the site reserves space the same way (doc 15). */
const ASPECT_RATIO: Record<MediaItem["aspect"], string> = {
  landscape: "16 / 9",
  portrait: "3 / 4",
  square: "1 / 1",
};

export interface LazyMediaProps {
  /** Image URL to load (thumb or full src, caller's choice). */
  src: string;
  /** Required alt text -- passed straight through from the manifest. */
  alt: string;
  aspect: MediaItem["aspect"];
  /** object-fit: cover fills+crops the box; contain letterboxes. */
  fit?: "cover" | "contain";
  className?: string;
}

/** A layout-stable lazy image: reserves its aspect box up front, then loads
 * the image lazily/asynchronously into it. */
export function LazyMedia({ src, alt, aspect, fit = "cover", className }: LazyMediaProps) {
  return (
    <div
      className={`relative w-full overflow-hidden border-2 border-mp-border bg-mp-surface${
        className ? ` ${className}` : ""
      }`}
      style={{ aspectRatio: ASPECT_RATIO[aspect] }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`h-full w-full select-none ${fit === "cover" ? "object-cover" : "object-contain"}`}
      />
    </div>
  );
}
