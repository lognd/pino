// Bullet-hole-in-glass click feedback -- docs/design/08-landing-hero.md
// (Revision 4). Pure visual layer: a portal overlay pinned to the viewport that
// draws each active hole. Decorative only -- aria-hidden, pointer-events: none --
// so it NEVER intercepts events and never delays the underlying navigation.
// Spawning + lifecycle live in useBulletholeClicks.ts; this file only renders.
//
// REVISION 4 quality bar (user: "needs the fractal pattern touchup and some
// TLC; really work hard and make these components look realistic and good").
// The old 5-8 straight spokes read cheap. Rebuilt as LAYERED GLASS DAMAGE:
//   * an irregular jittered-polygon dark CORE (not a circle);
//   * a bright crushed RING around it;
//   * kinked BRANCHING radial cracks generated with the SHARED branching
//     polyline generator (./branching.ts -- the same math the wordmark shatters
//     with, not a duplicate);
//   * a few short TANGENTIAL connector cracks between radials near the core;
//   * per-crack opacity variance; all seeded from the click position so no two
//     holes repeat.
// Subtle ~80ms pop-in, then a slow fade. Footprint stays ~64px, decorative-only.

import { createPortal } from "react-dom";
import { hash01, buildBranch, type Point } from "./branching";

/** One live bullet hole. `seed` is derived from the click position so the whole
 * damage pattern is stable for the hole's (brief) life. */
export interface Hole {
  id: number;
  x: number;
  y: number;
  seed: number;
}

/** Total fade lifetime in ms (kept in sync with the CSS animation below and the
 * removal timer in useBulletholeClicks.ts). ~80ms pop-in then a slow fade. */
export const HOLE_LIFETIME_MS = 720;

const DARK = "#0A0A0B";
const WHITE = "#F4F4F2";
const RED = "#E8112D";

/** Overlay box side (px), inside the doc's 48-72px footprint. */
export const SIZE = 64;
const R = SIZE / 2;

/** One rendered crack: a kinked polyline plus its stroke width + opacity. */
interface HoleCrack {
  points: Point[];
  width: number;
  opacity: number;
}

/** The full damage geometry for a hole. Centered on (R,R) in a SIZE box. */
export interface BulletholeGeometry {
  /** Irregular dark-core polygon (jittered, not a circle). */
  core: Point[];
  /** Crushed-ring radius. */
  ringR: number;
  cracks: HoleCrack[];
}

/** Build the layered glass damage for a seed. PURE + deterministic: same seed
 * -> identical geometry (unit-tested). Uses the shared branching generator. */
export function buildBullethole(seed: number): BulletholeGeometry {
  // Irregular dark core: 8-10 vertices at a jittered radius (never a circle).
  const coreVerts = 8 + Math.floor(hash01(seed * 3 + 1) * 3);
  const coreBaseR = R * 0.17;
  const core: Point[] = [];
  for (let i = 0; i < coreVerts; i++) {
    const a = (i / coreVerts) * Math.PI * 2;
    const rr = coreBaseR * (0.72 + hash01(seed * 11 + i) * 0.6);
    core.push({ x: R + Math.cos(a) * rr, y: R + Math.sin(a) * rr });
  }

  const ringR = coreBaseR * 1.55;

  // Kinked BRANCHING radial cracks (shared generator).
  const cracks: HoleCrack[] = [];
  const crackCount = 6 + Math.floor(hash01(seed * 5 + 2) * 4); // 6-9
  const radialStarts: Point[] = [];
  for (let i = 0; i < crackCount; i++) {
    const a = (i / crackCount) * Math.PI * 2 + (hash01(seed * 7 + i) - 0.5) * 0.7;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    const start: Point = { x: R + dirX * ringR, y: R + dirY * ringR };
    radialStarts.push(start);
    const length = R * (0.5 + hash01(seed * 13 + i) * 0.42);
    const segs = 3 + Math.floor(hash01(seed * 17 + i) * 2); // 3-4 kinked segs.
    const points = buildBranch(start, dirX, dirY, length, segs, seed * 23 + i * 5 + 1, 0.4);
    cracks.push({
      points,
      width: 0.7 + hash01(seed * 19 + i) * 0.9,
      opacity: 0.5 + hash01(seed * 29 + i) * 0.45, // per-crack variance.
    });
    // ~half spawn a shorter secondary branch partway out (fractal touch).
    if (hash01(seed * 31 + i) < 0.55) {
      const f = 0.4 + hash01(seed * 37 + i) * 0.35;
      const bStart: Point = {
        x: points[0].x + (points[points.length - 1].x - points[0].x) * f,
        y: points[0].y + (points[points.length - 1].y - points[0].y) * f,
      };
      const side = hash01(seed * 41 + i) < 0.5 ? 1 : -1;
      const dev = (0.35 + hash01(seed * 43 + i) * 0.35) * side; // ~20-40deg.
      const bx = dirX * Math.cos(dev) - dirY * Math.sin(dev);
      const by = dirX * Math.sin(dev) + dirY * Math.cos(dev);
      const bPts = buildBranch(bStart, bx, by, length * 0.5, 2, seed * 47 + i * 7 + 1, 0.5);
      cracks.push({
        points: bPts,
        width: 0.5 + hash01(seed * 53 + i) * 0.5,
        opacity: 0.35 + hash01(seed * 59 + i) * 0.35,
      });
    }
  }

  // A few short TANGENTIAL connectors between adjacent radials near the core.
  const connectors = 2 + Math.floor(hash01(seed * 61 + 3) * 2); // 2-3
  for (let c = 0; c < connectors; c++) {
    const i = Math.floor(hash01(seed * 67 + c) * crackCount);
    const a = radialStarts[i];
    const b = radialStarts[(i + 1) % crackCount];
    // A kinked chord bowed slightly outward, near the crushed ring.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const outX = (mx - R) * 0.14;
    const outY = (my - R) * 0.14;
    cracks.push({
      points: [a, { x: mx + outX, y: my + outY }, b],
      width: 0.5 + hash01(seed * 71 + c) * 0.4,
      opacity: 0.3 + hash01(seed * 73 + c) * 0.3,
    });
  }

  return { core, ringR, cracks };
}

/** One rendered hole: layered SVG glass damage, centered on the click. */
function BulletholeMark({ hole }: { hole: Hole }) {
  const g = buildBullethole(hole.seed);
  const corePts = g.core.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{
        position: "absolute",
        left: hole.x - R,
        top: hole.y - R,
        animation: `mp-bullethole ${HOLE_LIFETIME_MS}ms cubic-bezier(0.2,0.7,0.3,1) forwards`,
      }}
    >
      {/* Kinked branching + tangential cracks (drawn under the core/ring). */}
      <g fill="none" stroke={WHITE} strokeLinecap="round" strokeLinejoin="round">
        {g.cracks.map((crack, i) => (
          <polyline
            key={i}
            points={crack.points.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeWidth={crack.width}
            opacity={crack.opacity}
          />
        ))}
      </g>
      {/* Bright crushed ring around the impact. */}
      <circle cx={R} cy={R} r={g.ringR} fill="none" stroke={WHITE} strokeWidth={1.6} opacity={0.9} />
      {/* Irregular dark core with a thin red-hot edge. */}
      <polygon points={corePts} fill={DARK} stroke={RED} strokeWidth={1.2} />
      {/* White-hot centre. */}
      <circle cx={R} cy={R} r={g.ringR * 0.28} fill={WHITE} />
    </svg>
  );
}

/** Portal overlay hosting every live hole. Rendered ONCE by the app layer (via
 * useBulletholeClicks). Non-interactive and hidden from a11y. */
export function BulletholeOverlay({ holes }: { holes: Hole[] }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      <style>
        {`@keyframes mp-bullethole {
            0%   { opacity: 0; transform: scale(0.5); }
            11%  { opacity: 1; transform: scale(1.06); }
            22%  { transform: scale(1); }
            100% { opacity: 0; transform: scale(1); }
          }`}
      </style>
      {holes.map((h) => (
        <BulletholeMark key={h.id} hole={h} />
      ))}
    </div>,
    document.body,
  );
}
