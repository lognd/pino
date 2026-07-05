// Reactive wordmark -- docs/design/08-landing-hero.md (Revision 7).
//
// Inline-SVG lockup (MEL red, PINO white, heavy condensed italic per doc 09)
// that fractures into glass PIECES. Geometry and motion live in ./shards.ts
// and ./piecePhysics.ts (pure, DOM-free); this component renders once and
// then animates IMPERATIVELY (Revision 5: no per-frame React renders).
//
// REVISION 7 rules:
//   * LETTERS ARE OBJECTS. A crack cell that spans several glyphs must not
//     move them as one rigid body ("visual disconnect = different object").
//     Pieces = crack cell x letter-rect intersections; each piece clips only
//     its own letter's artwork and moves on its own seed.
//   * BABY PHYSICS. Separated pieces float from the FIRST frame of
//     separation (seeded kick + wander force, spring home, damping) and the
//     CURSOR pushes nearby pieces away. State steps in piecePhysics.ts.
//   * SUPERHOT. The caller passes a timeScale (scrubMachine.timeFlowScale);
//     physics time advances only while the viewer moves, so stillness
//     freezes the float mid-air. Settle/break ramps run at full time.
//
// Per-letter glyph cells were measured ONCE against the real webfont
// (getExtentOfChar, skew applied) and are baked below; they get replaced
// wholesale by the traced wordmark asset when it lands.
//
// PLACEHOLDER note: the glyphs are set from Barlow Condensed text, not the
// hand-traced asset. The fracture/reassembly machinery is production-shaped.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import {
  buildShards,
  buildPieces,
  shardTransform,
  shatterAmount,
  VIEW_W,
  VIEW_H,
  DEFAULT_IMPACT_FX,
  DEFAULT_IMPACT_FY,
  type LetterRect,
  type Point,
} from "./shards";
import {
  createPiecePhysics,
  stepPiecePhysics,
  rotWobbleDeg,
  type PiecePhysicsState,
} from "./piecePhysics";
import { flashEnvelope } from "./timeline";

const RED = "#E8112D";
const WHITE = "#F4F4F2";

/** Sub-pixel outward bleed (SVG user units) so adjacent piece clips overlap a
 * hair -- mid-shatter edges read as glass, never as AA seams. */
const BLEED = 0.9;

/** Peak opacity of the origin-side rim-light overlay at the flash beat. */
const RIM_MAX = 0.55;

/** Margin added around each measured glyph cell before clipping, so no
 * antialiased glyph edge is ever cropped by its own letter rect. */
const LETTER_RECT_MARGIN = 4;

/** Per-letter layout, measured once in the real webfont (see module note).
 * textX is the pre-skew <text> x; rect is the post-skew glyph cell. */
const LETTERS: { char: string; textX: number; fill: string; rect: LetterRect }[] = [
  { char: "M", textX: 150, fill: RED, rect: { x: 119, y: 28, w: 98.6, h: 168 } },
  { char: "E", textX: 222, fill: RED, rect: { x: 191, y: 28, w: 82.6, h: 168 } },
  { char: "L", textX: 278, fill: RED, rect: { x: 247, y: 28, w: 81.6, h: 168 } },
  { char: "P", textX: 360, fill: WHITE, rect: { x: 329, y: 28, w: 86.6, h: 168 } },
  { char: "I", textX: 420, fill: WHITE, rect: { x: 389, y: 28, w: 54.6, h: 168 } },
  { char: "N", textX: 448, fill: WHITE, rect: { x: 417, y: 28, w: 93.6, h: 168 } },
  { char: "O", textX: 515, fill: WHITE, rect: { x: 484, y: 28, w: 87.6, h: 168 } },
];

/** One letter's glyph, in the shared condensed-italic lean. */
function letterGlyph(index: number, fillOverride?: string) {
  const l = LETTERS[index];
  return (
    <g transform="skewX(-9)">
      <text
        x={l.textX}
        y="168"
        fontFamily="'Barlow Condensed', sans-serif"
        fontWeight={800}
        fontStyle="italic"
        fontSize={140}
        letterSpacing="-4"
        fill={fillOverride ?? l.fill}
      >
        {l.char}
      </text>
    </g>
  );
}

/** Expand a polygon outward from its centroid by `bleed` units so neighbouring
 * piece clips overlap slightly (hides AA seams mid-shatter). Pure. */
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

/** Imperative driver: the hero's rAF loop pushes frames and pointer samples
 * here, bypassing React entirely (Revision 5 performance rules). */
export interface WordmarkHandle {
  /** Draw one frame. `timeScale` in [0,1] is the SUPERHOT time flow --
   * physics time advances by frame-dt * timeScale. */
  setProgress(progress: number, timeScale?: number): void;
  /** Pointer sample in CLIENT coords (null = pointer left the hero). */
  setPointer(clientX: number | null, clientY?: number): void;
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
  // Fracture geometry, rebuilt only when the impact point changes.
  const { pieces } = useMemo(() => {
    const built = buildShards({ impactFx, impactFy });
    const rects = LETTERS.map((l) => ({
      x: l.rect.x - LETTER_RECT_MARGIN,
      y: l.rect.y - LETTER_RECT_MARGIN,
      w: l.rect.w + LETTER_RECT_MARGIN * 2,
      h: l.rect.h + LETTER_RECT_MARGIN * 2,
    }));
    return { pieces: buildPieces(built.shards, built.impact, rects) };
  }, [impactFx, impactFy]);
  // Clip polygons are geometry, not animation: compute once per fracture.
  const clipPoints = useMemo(
    () => pieces.map((p) => bleedPolygon(p.points, BLEED)),
    [pieces],
  );

  // The piece layer enters the DOM on the FIRST separation and then stays,
  // toggled via display -- never any seams at rest, never a mid-break mount.
  const [piecesMounted, setPiecesMounted] = useState(() => shatterAmount(progress) > 0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const staticRef = useRef<SVGGElement | null>(null);
  const pieceLayerRef = useRef<SVGGElement | null>(null);
  const rimRef = useRef<SVGGElement | null>(null);
  const pieceRefs = useRef<(SVGGElement | null)[]>([]);
  const appliedProgress = useRef<number>(-1);
  const requestedProgress = useRef<number>(progress);

  // Baby physics (Revision 7): offsets/velocities per piece + scratch arrays
  // for the pieces' current base positions (cursor force acts where pieces
  // visibly are). Recreated when the fracture geometry changes.
  const physics = useRef<PiecePhysicsState>(createPiecePhysics(0));
  const baseX = useRef<Float32Array>(new Float32Array(0));
  const baseY = useRef<Float32Array>(new Float32Array(0));
  useMemo(() => {
    physics.current = createPiecePhysics(pieces.length);
    baseX.current = new Float32Array(pieces.length);
    baseY.current = new Float32Array(pieces.length);
  }, [pieces]);

  /** Pointer in viewBox coords (null = away), fed by setPointer. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** Wall-clock of the previous applied frame, for physics dt. */
  const lastFrameMs = useRef<number>(-1);

  /** Write one frame straight to the DOM. While the lockup is separated the
   * pieces are physics-alive, so repeated calls at the same progress still
   * step and repaint; at rest an unchanged progress is a no-op. */
  const apply = useCallback(
    (p: number, timeScale = 1): void => {
      requestedProgress.current = p;
      const shatter = shatterAmount(p);
      const now = performance.now();
      const rawDt = lastFrameMs.current < 0 ? 0 : now - lastFrameMs.current;
      lastFrameMs.current = now;
      if (p === appliedProgress.current && shatter <= 0) return;

      if (shatter > 0 && !pieceLayerRef.current) {
        // First separation: mount the piece layer (once); the post-render
        // effect below re-applies this progress to the fresh nodes.
        setPiecesMounted(true);
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
      if (pieceLayerRef.current) {
        pieceLayerRef.current.style.display = shatter > 0 ? "" : "none";
      }
      if (shatter <= 0) {
        // Rest: zero the physics so the next break starts a fresh float.
        stepPiecePhysics(physics.current, pieces, baseX.current, baseY.current, {
          dtMs: 0,
          shatter: 0,
          pointerX: null,
          pointerY: null,
        });
        return;
      }

      // Base transforms first (they position the cursor force), then step
      // the sim by SUPERHOT-scaled time, then write base + offset.
      const nodes = pieceRefs.current;
      const bx = baseX.current;
      const by = baseY.current;
      for (let i = 0; i < pieces.length; i++) {
        const t = shardTransform(p, pieces[i]);
        bx[i] = pieces[i].cx + t.tx;
        by[i] = pieces[i].cy + t.ty;
      }
      stepPiecePhysics(physics.current, pieces, bx, by, {
        dtMs: rawDt * Math.max(0, Math.min(1, timeScale)),
        shatter,
        pointerX: pointer.current?.x ?? null,
        pointerY: pointer.current?.y ?? null,
      });
      const sim = physics.current;
      for (let i = 0; i < pieces.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        const piece = pieces[i];
        const t = shardTransform(p, piece);
        const wob = rotWobbleDeg(sim, piece.seed, shatter);
        node.setAttribute(
          "transform",
          `translate(${t.tx + sim.ox[i]} ${t.ty + sim.oy[i]}) ` +
            `rotate(${t.rot + wob} ${piece.cx} ${piece.cy}) ` +
            `translate(${piece.cx} ${piece.cy}) ` +
            `scale(${t.scale}) ` +
            `translate(${-piece.cx} ${-piece.cy})`,
        );
        node.setAttribute("opacity", t.opacity.toFixed(4));
      }
    },
    [pieces],
  );

  const setPointer = useCallback((clientX: number | null, clientY = 0): void => {
    const svg = svgRef.current;
    if (clientX === null || !svg) {
      pointer.current = null;
      return;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      pointer.current = null;
      return;
    }
    pointer.current = {
      x: ((clientX - rect.left) / rect.width) * VIEW_W,
      y: ((clientY - rect.top) / rect.height) * VIEW_H,
    };
  }, []);

  useImperativeHandle(ref, () => ({ setProgress: apply, setPointer }), [apply, setPointer]);

  // Sync the DOM after any React render (mount, piece-layer mount, prop or
  // impact change): re-apply the most recently requested progress.
  useEffect(() => {
    appliedProgress.current = -1;
    apply(requestedProgress.current);
  }, [apply, piecesMounted]);
  useEffect(() => {
    apply(progress);
  }, [apply, progress]);

  // Initial paint state (before any imperative frame) honors the prop.
  const initialShatter = shatterAmount(progress);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      // Pieces may poke past the viewBox mid-float (the field border
      // contains their centroids, polygon extents can overhang); visible
      // overflow means no hard clip line ever shows inside the hero.
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Each letter's artwork exists once; pieces <use> only their own. */}
        {LETTERS.map((_, i) => (
          <g id={`mp-letter-${i}`} key={i}>
            {letterGlyph(i)}
          </g>
        ))}
        {/* Origin-side rim light: white -> transparent, left to right. */}
        <linearGradient id="mp-rim-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <mask id="mp-rim-mask">
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#mp-rim-grad)" />
        </mask>
        {piecesMounted &&
          pieces.map((_, i) => (
            <clipPath id={`mp-shard-${i}`} key={i} clipPathUnits="userSpaceOnUse">
              <polygon points={clipPoints[i]} />
            </clipPath>
          ))}
      </defs>

      {/* At rest: ONE clean, unsplit lockup -- no clips, no seams. */}
      <g ref={staticRef} style={{ display: initialShatter > 0 ? "none" : undefined }}>
        {LETTERS.map((_, i) => (
          <use key={i} href={`#mp-letter-${i}`} />
        ))}
      </g>

      {piecesMounted && (
        <g ref={pieceLayerRef} style={{ display: initialShatter > 0 ? undefined : "none" }}>
          {pieces.map((piece, i) => (
            <g
              key={i}
              ref={(el) => {
                pieceRefs.current[i] = el;
              }}
            >
              <g clipPath={`url(#mp-shard-${i})`}>
                <use href={`#mp-letter-${piece.letterIndex}`} />
              </g>
            </g>
          ))}
        </g>
      )}

      {/* Flash-beat rim light raking in from the off-frame origin (left). */}
      <g ref={rimRef} opacity="0" mask="url(#mp-rim-mask)">
        {LETTERS.map((_, i) => (
          <g key={i}>{letterGlyph(i, "#FFFFFF")}</g>
        ))}
      </g>
    </svg>
  );
});

/** The assembled lockup, static, no fracture machinery at all -- for chrome
 * like the nav's backlink-home logo. Inline SVG (not an <img> asset) so it
 * uses the page webfont and is EXACTLY the hero lockup, letter for letter
 * (same LETTERS table -- NO DUPLICATION), just never cracked. No ids, so
 * any number can mount alongside the hero without defs collisions. */
export function StaticWordmark({ className }: { className?: string }) {
  // Cropped to the glyph extents (the hero's 640x240 field is mostly
  // breathing room) so the lockup fills its box in chrome contexts.
  return (
    <svg
      viewBox="105 20 480 190"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {LETTERS.map((_, i) => (
        <g key={i}>{letterGlyph(i)}</g>
      ))}
    </svg>
  );
}

/** Wire a container's pointer events into a WordmarkHandle (cursor-reactive
 * pieces). One home for the listener set so Hero and /hero-lab never drift. */
export function useWordmarkPointer(
  containerRef: RefObject<HTMLElement | null>,
  handleRef: RefObject<WordmarkHandle | null>,
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent): void =>
      handleRef.current?.setPointer(e.clientX, e.clientY);
    const onLeave = (): void => handleRef.current?.setPointer(null);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef, handleRef]);
}
