// Reactive wordmark -- docs/design/08-landing-hero.md (Revision 5).
//
// Inline-SVG lockup (MEL red, PINO white, heavy condensed italic per doc 09)
// that fractures into glass shards tiling the 640x240 field exactly. The
// tessellation + per-shard transform math live in ./shards.ts (pure, DOM-free);
// this component renders once and then animates IMPERATIVELY.
//
// REVISION 5 rendering rules (performance -- the "laggy" verdict):
//   * NO PER-FRAME REACT RENDERS. The rAF loop drives a WordmarkHandle
//     (setProgress) that writes shard transforms/opacity and layer visibility
//     straight to the DOM. React only reconciles on mount and on impact-point
//     changes; at 60fps the component function never re-runs.
//   * The lockup artwork exists ONCE (a <defs> group) and every shard clips a
//     <use> of it -- no duplicated <text> trees.
//   * The shard layer stays OUT OF THE DOM until the first separation (the
//     Revision 4 no-seam rule), then mounts once and is toggled via display so
//     the break moment never pays a 60-node mount mid-interaction again.
//
// REVISION 5 rim light: the old per-shard stroked outlines redrew the whole
// crack wireframe during every flash beat (the "break-lines" leak, reborn).
// Replaced by ONE white copy of the artwork behind a left-to-right fading
// mask whose group opacity rides flashEnvelope -- light raking the glyph
// faces from the off-frame origin, no outlines anywhere.
//
// PLACEHOLDER note: the glyphs are set from Barlow Condensed text, not the
// hand-traced asset. The fracture/reassembly machinery is production-shaped.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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

/** Peak opacity of the origin-side rim-light overlay at the flash beat. */
const RIM_MAX = 0.55;

/** The lockup glyphs, parameterized by fill (brand colors normally; solid
 * white for the rim-light copy). Skewed into the condensed-italic lean. */
function artworkGlyphs(melFill: string, pinoFill: string) {
  return (
    <g transform="skewX(-9)">
      <text
        x="150"
        y="168"
        fontFamily="'Barlow Condensed', sans-serif"
        fontWeight={800}
        fontStyle="italic"
        fontSize={140}
        letterSpacing="-4"
        fill={melFill}
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
        fill={pinoFill}
      >
        PINO
      </text>
    </g>
  );
}

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

/** Imperative driver: the hero's rAF loop pushes progress here, bypassing
 * React entirely (see the Revision 5 performance rules above). */
export interface WordmarkHandle {
  setProgress(progress: number): void;
}

export interface WordmarkProps {
  /** Initial/declarative progress; the rAF loop drives frames via the handle.
   * Defaults to 0 (assembled lockup). */
  progress?: number;
  /** Impact x as a fraction of the field width (tunable in /hero-lab). */
  impactFx?: number;
  /** Impact y as a fraction of the field height (tunable in /hero-lab). */
  impactFy?: number;
  className?: string;
}

/** The fracturing MEL PINO lockup. */
export const Wordmark = forwardRef<WordmarkHandle, WordmarkProps>(function Wordmark(
  { progress = 0, impactFx = DEFAULT_IMPACT_FX, impactFy = DEFAULT_IMPACT_FY, className },
  ref,
) {
  // Rebuild the fracture only when the impact point changes (default: once).
  const { shards } = useMemo(
    () => buildShards({ impactFx, impactFy }),
    [impactFx, impactFy],
  );
  // Clip polygons are geometry, not animation: compute once per fracture.
  const clipPoints = useMemo(
    () => shards.map((s) => bleedPolygon(s.points, BLEED)),
    [shards],
  );

  // The shard layer enters the DOM on the FIRST separation and then stays,
  // toggled via display -- never any seams at rest, never a mid-break mount.
  const [shardsMounted, setShardsMounted] = useState(() => shatterAmount(progress) > 0);

  const staticRef = useRef<SVGGElement | null>(null);
  const shardLayerRef = useRef<SVGGElement | null>(null);
  const rimRef = useRef<SVGGElement | null>(null);
  const shardRefs = useRef<(SVGGElement | null)[]>([]);
  const appliedProgress = useRef<number>(-1);
  const requestedProgress = useRef<number>(progress);

  /** Write one frame straight to the DOM. Idempotent; skips no-op repeats. */
  const apply = useCallback(
    (p: number): void => {
      requestedProgress.current = p;
      if (p === appliedProgress.current) return;

      const shatter = shatterAmount(p);
      if (shatter > 0 && !shardLayerRef.current) {
        // First separation: mount the shard layer (once); the post-render
        // effect below re-applies this progress to the fresh nodes.
        setShardsMounted(true);
        return;
      }
      appliedProgress.current = p;

      if (rimRef.current) {
        const rim = flashEnvelope(p) * RIM_MAX;
        rimRef.current.setAttribute("opacity", rim < 0.005 ? "0" : rim.toFixed(4));
      }
      if (staticRef.current) {
        staticRef.current.style.display = shatter > 0 ? "none" : "";
      }
      if (shardLayerRef.current) {
        shardLayerRef.current.style.display = shatter > 0 ? "" : "none";
      }
      if (shatter <= 0) return;

      const nodes = shardRefs.current;
      for (let i = 0; i < shards.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        const shard = shards[i];
        const t = shardTransform(p, shard);
        node.setAttribute(
          "transform",
          `translate(${t.tx} ${t.ty}) ` +
            `rotate(${t.rot} ${shard.cx} ${shard.cy}) ` +
            `translate(${shard.cx} ${shard.cy}) ` +
            `scale(${t.scale}) ` +
            `translate(${-shard.cx} ${-shard.cy})`,
        );
        node.setAttribute("opacity", t.opacity.toFixed(4));
      }
    },
    [shards],
  );

  useImperativeHandle(ref, () => ({ setProgress: apply }), [apply]);

  // Sync the DOM after any React render (mount, shard-layer mount, prop or
  // impact change): re-apply the most recently requested progress.
  useEffect(() => {
    appliedProgress.current = -1;
    apply(requestedProgress.current);
  }, [apply, shardsMounted]);
  useEffect(() => {
    apply(progress);
  }, [apply, progress]);

  // Initial paint state (before any imperative frame) honors the prop.
  const initialShatter = shatterAmount(progress);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The artwork exists once; the static layer and every shard <use> it. */}
        <g id="mp-artwork">{artworkGlyphs(RED, WHITE)}</g>
        {/* Origin-side rim light: white -> transparent, left to right. */}
        <linearGradient id="mp-rim-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <mask id="mp-rim-mask">
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#mp-rim-grad)" />
        </mask>
        {shardsMounted &&
          shards.map((_, i) => (
            <clipPath id={`mp-shard-${i}`} key={i} clipPathUnits="userSpaceOnUse">
              <polygon points={clipPoints[i]} />
            </clipPath>
          ))}
      </defs>

      {/* At rest: ONE clean, unsplit lockup -- no clips, no seams. */}
      <g ref={staticRef} style={{ display: initialShatter > 0 ? "none" : undefined }}>
        <use href="#mp-artwork" />
      </g>

      {shardsMounted && (
        <g ref={shardLayerRef} style={{ display: initialShatter > 0 ? undefined : "none" }}>
          {shards.map((_, i) => (
            <g
              key={i}
              ref={(el) => {
                shardRefs.current[i] = el;
              }}
            >
              <g clipPath={`url(#mp-shard-${i})`}>
                <use href="#mp-artwork" />
              </g>
            </g>
          ))}
        </g>
      )}

      {/* Flash-beat rim light raking in from the off-frame origin (left). */}
      <g ref={rimRef} opacity="0" mask="url(#mp-rim-mask)">
        {artworkGlyphs("#FFFFFF", "#FFFFFF")}
      </g>
    </svg>
  );
});
