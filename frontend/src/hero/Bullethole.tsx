// Bullet-hole-in-glass click feedback -- docs/design/08-landing-hero.md
// (Revision 2, NEW). Pure visual layer: a portal overlay pinned to the
// viewport that draws each active hole. It is decorative only -- aria-hidden,
// pointer-events: none -- so it NEVER intercepts events and never delays the
// underlying navigation/click. Spawning + lifecycle live in
// useBulletholeClicks.ts; this file only renders.
//
// Each hole: a dark core, a white-hot rim, and 5-8 radiating crack lines
// seeded deterministically from the click position, fading out over ~600ms.

import { createPortal } from "react-dom";

/** One live bullet hole. `seed` is derived from the click position so the
 * crack pattern is stable for the hole's whole (brief) life. */
export interface Hole {
  id: number;
  x: number;
  y: number;
  seed: number;
}

/** Total fade lifetime in ms (kept in sync with the CSS animation below and
 * the removal timer in useBulletholeClicks.ts). */
export const HOLE_LIFETIME_MS = 600;

const DARK = "#0A0A0B";
const WHITE = "#F4F4F2";
const RED = "#E8112D";

/** Deterministic [0,1) hash of an integer seed (mulberry mix, stateless). */
function hash01(seed: number): number {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const SIZE = 72; // overlay box side (px); the glyph sits centered in it.
const R = SIZE / 2;

/** One rendered hole: SVG core + rim + seeded cracks, centered on the click. */
function BulletholeMark({ hole }: { hole: Hole }) {
  const crackCount = 5 + Math.floor(hash01(hole.seed) * 4); // 5..8
  const cracks = [];
  for (let i = 0; i < crackCount; i++) {
    const a = (i / crackCount) * Math.PI * 2 + (hash01(hole.seed * 7 + i) - 0.5) * 0.8;
    const len = R * (0.45 + hash01(hole.seed * 13 + i) * 0.5);
    const x2 = R + Math.cos(a) * len;
    const y2 = R + Math.sin(a) * len;
    cracks.push(
      <line
        key={i}
        x1={R}
        y1={R}
        x2={x2}
        y2={y2}
        stroke={WHITE}
        strokeWidth={hash01(hole.seed * 17 + i) > 0.5 ? 1.4 : 0.8}
        strokeLinecap="round"
        opacity={0.85}
      />,
    );
  }
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{
        position: "absolute",
        left: hole.x - R,
        top: hole.y - R,
        animation: `mp-bullethole ${HOLE_LIFETIME_MS}ms ease-out forwards`,
      }}
    >
      {cracks}
      <circle cx={R} cy={R} r={R * 0.28} fill={DARK} stroke={RED} strokeWidth={1.2} />
      <circle cx={R} cy={R} r={R * 0.12} fill={WHITE} />
    </svg>
  );
}

/** Portal overlay hosting every live hole. Rendered ONCE by the app layer
 * (via useBulletholeClicks). Non-interactive and hidden from a11y. */
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
            0%   { opacity: 0; transform: scale(0.4); }
            18%  { opacity: 1; transform: scale(1.08); }
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
