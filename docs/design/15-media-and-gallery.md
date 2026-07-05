# 15 -- Media & Gallery

Audience: anyone building the image carousel, the gallery page, or
media serving. Read [00-overview.md](00-overview.md) first;
[09-design-system.md](09-design-system.md) owns the visual rules this
must obey (radius 0, hard edges, elderly-first controls, no
auto-advance); [13-storage-abstraction.md](13-storage-abstraction.md)
owns how bytes get served. Added per user request (2026-07-04):
"a super professional carousel that fits the style and maybe a
dedicated page for images/gallery (professional, served through R2),
everything lazy-loaded and videos not being loaded until 'play' is
clicked with only a thumbnail being displayed."

## Reference

logand.app has a working carousel
(`~/projects/logand.app/frontend/src/app/routes/public/ImageCarousel.tsx`)
and an R2 media pipeline (`ops/sync_public_media.py` +
`frontend/public/local-media/` + a pre-push hook). Crib the
MECHANICS (media manifest, sync script, lazy patterns) -- but the
carousel's visual style must be melpino's own, NOT logand's (explicit
user instruction: "change the carousel style").

## Media manifest (single source of truth)

`frontend/src/content/media.ts` -- typed, SAMPLE-marked like
`content/mock.ts`:

```ts
interface MediaItem {
  kind: "image" | "video";
  src: string;        // full URL (R2 public base + key) or /local-media/ path in dev
  thumb: string;      // ALWAYS present; the only thing loaded pre-interaction for video
  alt: string;        // required, non-empty -- a11y gate
  caption?: string;
  aspect: "landscape" | "portrait" | "square";
}
```

Until real photos/footage exist, entries point at SAMPLE placeholder
assets (solid-color SVG stand-ins with SAMPLE text baked in) so the
components are fully exercised. Swapping in real media = editing this
one file.

## Serving through R2

- Keys live under the `gallery/` namespace -- ADD `gallery/` to the
  public-prefix allowlist in `domain/storage/r2.py::is_public_key`
  (and its unit test) alongside `course-media/` and `brand/`; update
  [13-storage-abstraction.md](13-storage-abstraction.md)'s namespace
  table in the same change.
- Upload path: crib logand's `ops/sync_public_media.py` +
  `frontend/public/local-media/` manifest convention (dev serves
  local files; the sync script pushes to R2 with long-lived
  cache-control and immutable hash-suffixed keys; the media manifest
  holds the public URLs). Script adaptation is part of this work;
  actually RUNNING it is P7 (needs the R2 bucket -- HUMAN INPUT).

## Lazy-loading rules (hard requirements)

- Images: `loading="lazy"` + `decoding="async"` + explicit
  width/height (or aspect-ratio box) so nothing shifts layout.
  Below-the-fold gallery sections mount via IntersectionObserver.
- Videos: NO `<video>` element, NO network fetch of video bytes
  until the user clicks the play affordance. Pre-click, render the
  `thumb` image + a big labeled play button (min 56px, doc 09).
  On click: mount `<video controls preload="auto" poster={thumb}>`
  and `.play()`. Reduced-motion users get the identical
  click-to-play behavior (no autoplay for anyone, ever).

## Carousel component (`components/Carousel.tsx`)

- Manual navigation ONLY (doc 09 bans auto-advance): big labeled
  prev/next buttons (not bare chevrons -- include text or aria-label
  + large hit area), swipe on touch, arrow keys when focused,
  visible "N of M" text counter (never dots-only).
- Style: melpino's hard-edged language -- full-bleed image area,
  2px border, offset-shadow hover states, the --mp-skew diagonal
  accent on the frame or counter chip, red used only for the active
  control accent. It must NOT look like logand's carousel.
- One slide visible with edge-peek of neighbors (communicates
  "there's more" without dots), CSS scroll-snap or transform-based;
  reduced-motion = instant swap, no slide animation.
- **Prototype alternatives (user instruction)**: build 2-3 finished
  visual variants (e.g. edge-peek strip, full-bleed w/ counter chip,
  filmstrip w/ thumbnail rail) behind a `variant` prop, all
  presentable; a dev-only `/carousel-lab` route (like /hero-lab)
  renders all variants with the SAMPLE media so a human picks. The
  chosen default ships on Landing/Gallery; alternates remain.
  - **Shipped default: `edge-peek`** (pending a human confirmation pass
    in /carousel-lab). It best communicates "there is more" without
    dots-only navigation while keeping the big labeled controls and the
    skewed N-of-M counter chip. `full-bleed` and `filmstrip` remain
    available behind the `variant` prop.

## Gallery page (`/gallery`)

- Route + nav item ("Gallery") on the public site; prerendered like
  every public page ([10-seo-and-content.md](10-seo-and-content.md)),
  JSON-LD ImageGallery object.
- Layout: carousel (chosen variant) up top for featured items, then
  a hard-edged responsive grid (aspect-ratio boxes, 2px borders,
  captions under -- never hover-only) of all manifest items; videos
  in the grid follow the click-to-play rule; images open in an
  accessible lightbox (focus-trapped dialog, Esc + big labeled close
  button, no keyboard traps) -- keep the lightbox minimal.
- Landing gets a small "from the range" strip (3-4 items) linking to
  /gallery, replacing nothing that exists (additive section).

## Test obligations

Unit: manifest type guards (non-empty alt), carousel keyboard
navigation + counter math, video component does not create a video
element pre-click (assert no <video> in DOM until play). System
(Playwright): /gallery prerendered + axe-clean; video thumbnail
click mounts and starts the player; no video network request
pre-click (route interception assertion); carousel operable by
keyboard only. See [12-testing-strategy.md](12-testing-strategy.md).

## What NOT to put here

- Visual tokens -> [09-design-system.md](09-design-system.md)
- Storage mechanics -> [13-storage-abstraction.md](13-storage-abstraction.md)
- SEO/meta -> [10-seo-and-content.md](10-seo-and-content.md)
