// Reactive wordmark -- docs/design/08-landing-hero.md. OBLIGATIONS:
//   - Inline SVG lockup (MEL in red, PINO in white, heavy condensed
//     italic per doc 09), pre-split into ~12-20 shard polygons (shard
//     boundaries hand-drawn in the SVG asset, id'd `shard-*`).
//   - A PURE `progress -> transform` map per shard: displacement
//     proportional to |progress - SHOT_MOMENT|, per-fragment random
//     vectors seeded ONCE (stable across frames, doc 08's purity rule --
//     no independent timer loop, scrubbing backward must reassemble
//     exactly).
//   - Fragments reassemble to a pixel-perfect lockup at progress
//     extremes (0 and 1).
//
// TODO(impl): docs/design/08-landing-hero.md

import { SHOT_MOMENT } from "./timeline";

export interface WordmarkProps {
  progress: number;
}

export function Wordmark({ progress }: WordmarkProps) {
  // TODO(impl): docs/design/08-landing-hero.md -- replace with the real
  // shard-split SVG (see public/brand/wordmark.svg placeholder) and a
  // pure per-shard transform keyed off |progress - SHOT_MOMENT|.
  void progress;
  void SHOT_MOMENT;
  return (
    <img
      src="/brand/wordmark.svg"
      alt=""
      role="presentation"
      className="h-auto w-full max-w-lg"
    />
  );
}
