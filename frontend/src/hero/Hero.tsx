// Hero composition: lazy init + fallback logic -- docs/design/08-landing-hero.md.
// OBLIGATIONS (restated from doc 08):
//   - Degradation ladder, EACH rung required: (1) prefers-reduced-motion
//     -> posterUrl() + static wordmark, no scrub/drift/shatter; (2) no-JS
//     -> poster + static SVG lockup already in prerendered HTML, zero
//     hero code; (3) touch/keyboard (no hover) -> idle drift only, never
//     hijack touch scroll; (4) low-power -> drop to poster + one log line
//     if fps < 30 for two consecutive seconds.
//   - Hero JS chunk (simulated source + scrub + wordmark) <= 60KB gzip;
//     lazy-loaded via import() behind the poster so Landing's LCP never
//     waits on it (source init happens after, behind
//     requestIdleCallback).
//   - hero region is aria-hidden decoration; the H1 with the business
//     name exists in real DOM text independent of the visual wordmark.
//
// TODO(impl): docs/design/08-landing-hero.md

import { businessShortName } from "../lib/brand";

export function Hero() {
  // TODO(impl): docs/design/08-landing-hero.md -- lazy-load
  // sources/simulated.ts or sources/video.ts per VITE_HERO_SOURCE, wire
  // useScrub, render Wordmark.tsx on the same progress value.
  return (
    <div className="relative bg-mp-black-true" aria-hidden="true">
      {/* The real, screen-reader-visible business name lives OUTSIDE this
          aria-hidden region -- see App.tsx's Landing route, which renders
          the real <h1>. This div is decoration only. */}
      <span className="sr-only">{businessShortName}</span>
    </div>
  );
}
