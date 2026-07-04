// Pure shard geometry + transform math for the reactive wordmark --
// docs/design/08-landing-hero.md (Revision 2). Kept DOM-free so purity and
// the reassemble-at-extremes contract are unit-testable without rendering SVG.
//
// SHATTER RULE (resolution of a genuine contradiction in doc 08):
//   Doc 08 says both (a) "displacement proportional to |progress -
//   SHOT_MOMENT|" AND (b) fragments "reassemble to a pixel-perfect lockup
//   at progress extremes" (0 and 1). Read literally, (a) makes displacement
//   MAXIMAL at the extremes, contradicting (b). We encode a SIDE-NORMALIZED
//   tent that IS a pure function of |progress - SHOT_MOMENT| yet is zero at
//   both extremes and peaks at SHOT_MOMENT:
//
//     u = |progress - SHOT_MOMENT| / (progress < SHOT_MOMENT
//                                       ? SHOT_MOMENT
//                                       : 1 - SHOT_MOMENT)      // u in [0,1]
//     shatter = smoothstep(1 - u)     // 1 at the shot, 0 at each extreme
//
// RADIAL-CRACK TESSELLATION (Revision 2): uniform triangle grids read as
// cheap ("flash game"). The lockup is instead fractured like laminated glass
// around an IMPACT POINT (roughly where the off-frame origin points, see
// timeline.ts ORIGIN_*): rays radiate from the impact to the field boundary
// (corner rays inserted so every sector base is a single straight edge, which
// keeps the union EXACTLY the rect -> pixel-perfect reassembly), then each
// sector is split radially into bands -- small fragments near the impact,
// larger slabs at the periphery, long slivers inside thin sectors. Per-shard
// motion is displacement ALONG the radial vector from the impact, with a
// deterministic stagger (nearer impact = earlier + farther), rotation up to
// ~25deg, scale 0.92-1.06, and opacity falloff. All randomness is seeded ONCE
// from the shard index, so shardTransform is a pure function of (progress,
// shard) -- determinism and extremes-identity are unchanged.

import { SHOT_MOMENT, ORIGIN_FY } from "./timeline";

/** Wordmark field the shards tile (matches Wordmark.tsx viewBox). */
export const VIEW_W = 640;
export const VIEW_H = 240;

/** Default impact point on the lockup, as fractions of the field. Sits on the
 * origin side (left) at barrel height so the crack "comes from" the off-frame
 * origin (timeline.ts ORIGIN_*). Tunable in /hero-lab. */
export const DEFAULT_IMPACT_FX = 0.16;
export const DEFAULT_IMPACT_FY = ORIGIN_FY;

/** Base radial rays before corner rays are inserted. */
const RAY_COUNT = 13;

/** Max per-shard translation in SVG user units (viewBox is 640x240). */
const MAX_TRANSLATE = 160;
/** Max per-shard rotation at full shatter, degrees. */
const MAX_ROTATE_DEG = 25;
/** Opacity floor at full shatter (motion-blur-suggesting falloff). */
const MIN_OPACITY = 0.42;

export interface Point {
  x: number;
  y: number;
}

/** One glass fragment: its polygon plus the impact-relative data driving its
 * pure transform. */
export interface Shard {
  /** Polygon vertices (3 for the innermost band, 4 for outer bands). */
  points: Point[];
  /** Centroid (rotation/scale pivot). */
  cx: number;
  cy: number;
  /** Unit radial vector from the impact point through the centroid. */
  dirX: number;
  dirY: number;
  /** Centroid distance from impact, normalized to [0,1] across the field. */
  distNorm: number;
  /** Stable per-shard seed (used for spin + scale sign). */
  seed: number;
}

export interface ShardTransform {
  /** Translation x in SVG user units. */
  tx: number;
  /** Translation y in SVG user units. */
  ty: number;
  /** Rotation in degrees (about the shard centroid, applied by caller). */
  rot: number;
  /** Uniform scale factor (about the shard centroid). */
  scale: number;
  /** Opacity in [MIN_OPACITY, 1]. */
  opacity: number;
}

export interface BuildShardsOptions {
  /** Impact x as a fraction of the field width (default DEFAULT_IMPACT_FX). */
  impactFx?: number;
  /** Impact y as a fraction of the field height (default DEFAULT_IMPACT_FY). */
  impactFy?: number;
}

/** Deterministic [0,1) hash of an integer seed (mulberry32 mix, stateless). */
function hash01(seed: number): number {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Shatter amount in [0,1]: peaks (1) at SHOT_MOMENT, 0 at progress 0 and 1.
 * Exported for tests and for the source to share the same envelope. */
export function shatterAmount(progress: number): number {
  const p = clamp01(progress);
  const dist = Math.abs(p - SHOT_MOMENT);
  const half = p < SHOT_MOMENT ? SHOT_MOMENT : 1 - SHOT_MOMENT;
  const u = half > 0 ? dist / half : 0;
  return smoothstep(1 - u);
}

/** First positive intersection of the ray from `origin` in unit direction
 * (dx,dy) with the [0,W]x[0,H] rect boundary. */
function rayToBoundary(ox: number, oy: number, dx: number, dy: number): Point {
  let best = Infinity;
  const consider = (t: number): void => {
    if (t > 1e-6 && t < best) best = t;
  };
  if (Math.abs(dx) > 1e-9) {
    consider((0 - ox) / dx);
    consider((VIEW_W - ox) / dx);
  }
  if (Math.abs(dy) > 1e-9) {
    consider((0 - oy) / dy);
    consider((VIEW_H - oy) / dy);
  }
  if (!isFinite(best)) best = 0;
  return { x: ox + dx * best, y: oy + dy * best };
}

/** Build the glass fracture ONCE (deterministic). Returns the impact point and
 * the fragment list; the union of the fragments is exactly the field rect. */
export function buildShards(options: BuildShardsOptions = {}): {
  impact: Point;
  shards: Shard[];
} {
  const ix = clamp01(options.impactFx ?? DEFAULT_IMPACT_FX) * VIEW_W;
  const iy = clamp01(options.impactFy ?? DEFAULT_IMPACT_FY) * VIEW_H;
  const impact: Point = { x: ix, y: iy };

  // Angles: jittered base rays + rays straight at each corner (so no sector
  // base ever straddles a corner -> every base is one straight edge segment).
  const angles: number[] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const jitter = (hash01(i * 2 + 1) - 0.5) * ((Math.PI * 2) / RAY_COUNT) * 0.7;
    angles.push((i / RAY_COUNT) * Math.PI * 2 + jitter);
  }
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: VIEW_W, y: 0 },
    { x: VIEW_W, y: VIEW_H },
    { x: 0, y: VIEW_H },
  ];
  for (const c of corners) angles.push(Math.atan2(c.y - iy, c.x - ix));
  // Normalize to [0,2pi) and sort into a fan.
  const norm = angles.map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
  norm.sort((a, b) => a - b);

  // Boundary hit for each ray.
  const bounds: Point[] = norm.map((a) =>
    rayToBoundary(ix, iy, Math.cos(a), Math.sin(a)),
  );

  const maxR = Math.max(
    ...bounds.map((b) => Math.hypot(b.x - ix, b.y - iy)),
    1e-6,
  );

  const shards: Shard[] = [];
  const pushShard = (points: Point[], seed: number): void => {
    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;
    let dx = cx - ix;
    let dy = cy - iy;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      dx /= len;
      dy /= len;
    } else {
      dx = 1;
      dy = 0;
    }
    shards.push({
      points,
      cx,
      cy,
      dirX: dx,
      dirY: dy,
      distNorm: clamp01(len / maxR),
      seed,
    });
  };

  const n = norm.length;
  for (let k = 0; k < n; k++) {
    const bk = bounds[k];
    const bnext = bounds[(k + 1) % n];

    // Radial split fractions along both sector edges (small near impact,
    // growing outward: r_j = (j/K)^1.6 with a touch of jitter).
    const kSplits = 2 + Math.floor(hash01(k * 5 + 3) * 3); // 2..4 bands.
    const fracs: number[] = [];
    for (let j = 1; j <= kSplits; j++) {
      const base = Math.pow(j / kSplits, 1.6);
      const jit = j < kSplits ? (hash01(k * 7 + j) - 0.5) * 0.08 : 0;
      fracs.push(clamp01(base + jit));
    }
    fracs.sort((a, b) => a - b);
    fracs[fracs.length - 1] = 1;

    let prev = 0;
    for (let j = 0; j < fracs.length; j++) {
      const r = fracs[j];
      const innerL = { x: ix + (bk.x - ix) * prev, y: iy + (bk.y - iy) * prev };
      const innerR = {
        x: ix + (bnext.x - ix) * prev,
        y: iy + (bnext.y - iy) * prev,
      };
      const outerL = { x: ix + (bk.x - ix) * r, y: iy + (bk.y - iy) * r };
      const outerR = {
        x: ix + (bnext.x - ix) * r,
        y: iy + (bnext.y - iy) * r,
      };
      const seed = k * 131 + j * 17 + 1;
      if (prev === 0) {
        // Innermost band collapses to a triangle at the impact apex.
        pushShard([impact, outerR, outerL], seed);
      } else {
        pushShard([innerL, innerR, outerR, outerL], seed);
      }
      prev = r;
    }
  }

  return { impact, shards };
}

/** Pure per-shard transform: same (progress, shard) -> same result. At
 * progress 0 and 1 shatterAmount is 0, so every field is the identity and the
 * fragments reassemble pixel-perfect. Displacement is along the shard's radial
 * vector from the impact; nearer-impact shards lead and travel farther. */
export function shardTransform(progress: number, shard: Shard): ShardTransform {
  const amount = shatterAmount(progress);

  // Deterministic stagger: nearer the impact (distNorm ~ 0) rises earlier
  // (smaller exponent -> concave) and reaches farther; the periphery lags.
  const exponent = 0.7 + shard.distNorm * 0.8; // 0.7 (near) .. 1.5 (far).
  const staggered = Math.pow(amount, exponent);
  const reach = 1.0 - shard.distNorm * 0.5; // 1.0 (near) .. 0.5 (far).

  const spin = hash01(shard.seed * 3 + 1) * 2 - 1; // [-1, 1]
  // Scale delta in [-0.08, +0.06] -> scale in [0.92, 1.06] at full shatter.
  const scaleDelta = -0.08 + hash01(shard.seed * 3 + 2) * 0.14;

  const mag = MAX_TRANSLATE * reach * staggered;
  const tx = shard.dirX * mag;
  const ty = shard.dirY * mag;
  const rot = spin * MAX_ROTATE_DEG * staggered;
  const scale = 1 + scaleDelta * staggered;
  const opacity = 1 - (1 - MIN_OPACITY) * staggered;

  return { tx, ty, rot, scale, opacity };
}
