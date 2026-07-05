// Reactive wordmark -- docs/design/08-landing-hero.md (Revision 4).
//
// Inline-SVG lockup (MEL red, PINO white, heavy condensed italic per doc 09)
// that fractures into glass shards tiling the 640x240 field exactly. The
// tessellation + per-shard transform math live in ./shards.ts (pure, DOM-free);
// this component only renders.
//
// REVISION 4 rendering rules:
//   * NO CRACK-LINE OVERLAY. The stroked hairline network is removed entirely
//     (user verdict: "looks terrible") -- shard separation alone tells the story.
//   * NO SEAM AT REST. The old build leaked clip-path antialiasing seams
//     ("break-lines") before any shatter because it always rendered the artwork
//     as separate clipped shards. Fix: when shatter == 0 render the WHOLE
//     UNSPLIT lockup (one clean group, no clips); mount the shard layer ONLY
//     once separation begins (shatter > 0). Shard clip polygons get a sub-pixel
//     outward BLEED so mid-shatter gaps read as glass, not SVG seams.
//   * ORIGIN-SIDE RIM. During the flash beat, origin-facing shard edges catch a
//     white rim highlight (coordinated with the source's light-on-the-scene via
//     the shared flashEnvelope), brightest on edges facing the off-frame origin.
//
// PLACEHOLDER note: the glyphs are set from Barlow Condensed text, not the
// hand-traced asset. The fracture/reassembly machinery is production-shaped.

import { useMemo } from "react";
import {
  buildShards,
  shardTransform,
  shatterAmount,
  VIEW_W,
  VIEW_H,
  DEFAULT_IMPACT_FX,
  DEFAULT_IMPACT_FY,
  type Point,
} from "./shards";
import { flashEnvelope } from "./timeline";

const RED = "#E8112D";
const WHITE = "#F4F4F2";

/** Sub-pixel outward bleed (SVG user units) so adjacent shard clips overlap a
 * hair -- mid-shatter edges read as glass, never as AA seams. */
const BLEED = 0.9;

/** The full lockup artwork, reused (clipped) inside every shard AND rendered
 * whole at rest. Skewed to lean into the condensed-italic look. */
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

/** Expand a polygon outward from its centroid by `bleed` units so neighbouring
 * shard clips overlap slightly (hides AA seams mid-shatter). Pure. */
function bleedPolygon(points: Point[], bleed: number): string {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points
    .map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return `${p.x + (dx / len) * bleed},${p.y + (dy / len) * bleed}`;
    })
    .join(" ");
}

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

  const shatter = shatterAmount(progress);
  const shattered = shatter > 0; // mount the shard layer only once separating.
  // Origin-side rim highlight rides the shared single-beat flash envelope.
  const flash = flashEnvelope(progress);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* At rest: ONE clean, unsplit lockup -- no clips, no seams. */}
      {!shattered && ARTWORK}

      {shattered && (
        <>
          <defs>
            {shards.map((shard, i) => (
              <clipPath id={`mp-shard-${i}`} key={i} clipPathUnits="userSpaceOnUse">
                <polygon points={bleedPolygon(shard.points, BLEED)} />
              </clipPath>
            ))}
          </defs>
          {shards.map((shard, i) => {
            const t = shardTransform(progress, shard);
            const transform =
              `translate(${t.tx} ${t.ty}) ` +
              `rotate(${t.rot} ${shard.cx} ${shard.cy}) ` +
              `translate(${shard.cx} ${shard.cy}) ` +
              `scale(${t.scale}) ` +
              `translate(${-shard.cx} ${-shard.cy})`;
            // Origin sits to the LEFT: shards whose radial vector faces left
            // (dirX < 0) catch the rim; brightness scales with the flash beat.
            const facing = Math.max(0, -shard.dirX);
            const rim = flash * facing * 0.85;
            return (
              <g key={i} transform={transform} opacity={t.opacity}>
                <g clipPath={`url(#mp-shard-${i})`}>{ARTWORK}</g>
                {rim > 0.01 && (
                  <polygon
                    points={shard.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={WHITE}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                    opacity={Math.min(1, rim)}
                  />
                )}
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}
