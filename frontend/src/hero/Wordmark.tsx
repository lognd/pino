// Reactive wordmark -- docs/design/08-landing-hero.md (Revision 2).
//
// Inline-SVG lockup (MEL red, PINO white, heavy condensed italic per doc 09)
// fractured into radial-crack glass shards that tile the 640x240 field
// exactly. The tessellation + per-shard transform math live in ./shards.ts
// (pure, DOM-free); this component only renders. Each shard is the full
// artwork clipped to one fragment polygon, so at the identity transform the
// clips tile with no gaps/overlaps and the union is a PIXEL-PERFECT lockup
// (doc 08's reassemble-at-extremes rule). Whole at progress 0 and 1, maximally
// shattered at SHOT_MOMENT -- see ./shards.ts for the shatter + crack rules.
//
// PLACEHOLDER note (kept per frontend/public/brand/README.md): the letter
// glyphs are set from Barlow Condensed text, not the hand-traced asset. The
// fracture/reassembly machinery is production-shaped; only the glyph artwork
// is provisional pending the traced shard-split SVG.

import { useMemo } from "react";
import {
  buildShards,
  shardTransform,
  VIEW_W,
  VIEW_H,
  DEFAULT_IMPACT_FX,
  DEFAULT_IMPACT_FY,
} from "./shards";

const RED = "#E8112D";
const WHITE = "#F4F4F2";

/** The full lockup artwork, reused (clipped) inside every shard. Skewed to
 * lean into the condensed-italic look; edges stay hard (no blur). */
const ARTWORK = (
  <g transform="skewX(-9)">
    <text
      x="150"
      y="168"
      fontFamily="'Barlow Condensed', sans-serif"
      fontWeight={800}
      fontStyle="italic"
      fontSize={140}
      letterSpacing="-4"
      fill={RED}
    >
      MEL
    </text>
    <text
      x="360"
      y="168"
      fontFamily="'Barlow Condensed', sans-serif"
      fontWeight={800}
      fontStyle="italic"
      fontSize={140}
      letterSpacing="-4"
      fill={WHITE}
    >
      PINO
    </text>
  </g>
);

export interface WordmarkProps {
  /** Scrub progress in [0,1]; drives the pure per-shard shatter. */
  progress: number;
  /** Impact x as a fraction of the field width (tunable in /hero-lab). */
  impactFx?: number;
  /** Impact y as a fraction of the field height (tunable in /hero-lab). */
  impactFy?: number;
  className?: string;
}

/** The fracturing MEL PINO lockup. */
export function Wordmark({
  progress,
  impactFx = DEFAULT_IMPACT_FX,
  impactFy = DEFAULT_IMPACT_FY,
  className,
}: WordmarkProps) {
  // Rebuild the fracture only when the impact point changes (default: once).
  const { shards } = useMemo(
    () => buildShards({ impactFx, impactFy }),
    [impactFx, impactFy],
  );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {shards.map((shard, i) => (
          <clipPath id={`mp-shard-${i}`} key={i} clipPathUnits="userSpaceOnUse">
            <polygon points={shard.points.map((p) => `${p.x},${p.y}`).join(" ")} />
          </clipPath>
        ))}
      </defs>
      {shards.map((shard, i) => {
        const t = shardTransform(progress, shard);
        // translate; rotate about centroid; scale about centroid.
        const transform =
          `translate(${t.tx} ${t.ty}) ` +
          `rotate(${t.rot} ${shard.cx} ${shard.cy}) ` +
          `translate(${shard.cx} ${shard.cy}) ` +
          `scale(${t.scale}) ` +
          `translate(${-shard.cx} ${-shard.cy})`;
        return (
          <g key={i} transform={transform} opacity={t.opacity}>
            <g clipPath={`url(#mp-shard-${i})`}>{ARTWORK}</g>
          </g>
        );
      })}
    </svg>
  );
}
