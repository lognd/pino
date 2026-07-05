// Pure shard geometry + transform math for the reactive wordmark --
// docs/design/08-landing-hero.md (Revision 4). Kept DOM-free so purity and the
// reassemble-at-0 contract are unit-testable without rendering SVG.
//
// SHATTER ENVELOPE (Revision 3, unchanged):
//
//     shatter(p) = 0                                          for p <= SHOT_MOMENT
//                = smoothstep((p - SHOT_MOMENT)/(1 - SHOT))   rising to 1 at p = 1
//
//   The envelope HOLDS at full (1) at the right extreme -- parking the cursor
//   full-right leaves the lockup blown apart. Monotone non-decreasing; equals 0
//   (pixel-perfect identity) ONLY at p = 0. Idle settle-home always eases to 0
//   (scrubMachine.ts), so on inaction MEL PINO drifts back together every time.
//
// BRANCHED, FRACTAL-LIKE TESSELLATION (Revision 3, kept): the lockup fractures
// around an IMPACT POINT into kinked PRIMARY polylines (3-6 segments, per-
// segment angular jitter, each inside its own angular wedge so primaries never
// cross). SHARDS are the cells of that primary network -- an angular sector
// between two adjacent kinked primaries, split into radial bands at the union of
// both primaries' kink params (so every cell edge follows a real kinked crack),
// plus near-impact splits (splintery near the impact, large slabs at periphery).
//
// REVISION 4: the rendered hairline CRACK OVERLAY IS REMOVED (user verdict:
// "looks terrible"). Shard separation alone tells the story, so buildShards no
// longer emits a crack list -- only the tessellation. The kinked-polyline
// generator (hash01/buildBranch) now lives in ./branching.ts, shared with the
// bullet-hole glass damage rather than duplicated here.
//
// Per-shard motion keeps the depth cues -- displacement ALONG the radial vector
// from the impact, deterministic stagger (nearer-impact shards lead and travel
// farther), rotation, scale, opacity falloff. All randomness is seeded ONCE from
// indices, so buildShards and shardTransform are pure/deterministic.

import { SHOT_MOMENT, ORIGIN_FY } from "./timeline";
import { hash01, clamp01, type Point } from "./branching";

/** Wordmark field the shards tile (matches Wordmark.tsx viewBox). */
export const VIEW_W = 640;
export const VIEW_H = 240;

/** Default impact point on the lockup, as fractions of the field. Sits on the
 * origin side (left) at barrel height so the crack "comes from" the off-frame
 * origin (timeline.ts ORIGIN_*). Tunable in /hero-lab. */
export const DEFAULT_IMPACT_FX = 0.16;
export const DEFAULT_IMPACT_FY = ORIGIN_FY;

/** Base radial primaries before the four corner primaries are inserted. */
const RAY_COUNT = 8;

/** Max per-shard translation in SVG user units (viewBox is 640x240). */
const MAX_TRANSLATE = 170;
/** Max per-shard rotation at full shatter, degrees. */
const MAX_ROTATE_DEG = 26;
/** Opacity floor at full shatter (motion-blur-suggesting falloff). */
const MIN_OPACITY = 0.42;

export type { Point };

/** One glass fragment: its polygon plus the impact-relative data driving its
 * pure transform. */
export interface Shard {
  /** Polygon vertices (3 for an innermost apex cell, 4 for outer bands). */
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
  tx: number;
  ty: number;
  rot: number;
  scale: number;
  opacity: number;
}

export interface BuildShardsOptions {
  impactFx?: number;
  impactFy?: number;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Shatter amount in [0,1]: 0 for p <= SHOT_MOMENT, then smoothstep-rising to a
 * FULL, HELD 1 at p = 1. Monotone non-decreasing; 0 only at p = 0. */
export function shatterAmount(progress: number): number {
  const p = clamp01(progress);
  if (p <= SHOT_MOMENT) return 0;
  return smoothstep((p - SHOT_MOMENT) / (1 - SHOT_MOMENT));
}

/** First positive intersection of the ray from (ox,oy) in unit direction
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

/** A kinked primary crack: a radial polyline from impact (t=0) to a boundary
 * point (t=1). `params[i]` is the radius fraction t at vertex i (ascending). */
interface Primary {
  angle: number;
  R: number;
  points: Point[];
  params: number[];
}

/** Shortest circular distance between two angles in [0, 2pi). */
function circularGap(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** Evaluate a primary polyline at radius fraction f in [0,1]. */
function evalPrimary(prim: Primary, f: number): Point {
  const ff = clamp01(f);
  const { params, points } = prim;
  for (let i = 1; i < params.length; i++) {
    if (ff <= params[i] + 1e-9) {
      const t0 = params[i - 1];
      const t1 = params[i];
      const u = t1 > t0 ? (ff - t0) / (t1 - t0) : 0;
      const a = points[i - 1];
      const b = points[i];
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  return points[points.length - 1];
}

/** Build one kinked primary crack in its angular wedge. Lateral (angular)
 * deviation is bounded by 0.35 * neighbour gap and vanishes at both ends, so
 * the polyline stays strictly inside its wedge (no crossing) with its endpoint
 * pinned exactly on the boundary. */
function buildPrimary(
  ix: number,
  iy: number,
  angle: number,
  gap: number,
  seed: number,
): Primary {
  const boundary = rayToBoundary(ix, iy, Math.cos(angle), Math.sin(angle));
  const R = Math.hypot(boundary.x - ix, boundary.y - iy);
  // 2..5 interior kinks -> 3..6 segments.
  const kinks = 2 + Math.floor(hash01(seed * 7 + 1) * 4);
  const points: Point[] = [{ x: ix, y: iy }];
  const params: number[] = [0];
  const latMax = gap * 0.35;
  for (let j = 1; j <= kinks; j++) {
    const base = j / (kinks + 1);
    const t = clamp01(base + (hash01(seed * 13 + j) - 0.5) * (0.5 / (kinks + 1)));
    const env = Math.sin(Math.PI * t); // 0 at both ends -> pins endpoints.
    const da = (hash01(seed * 17 + j) - 0.5) * 2 * latMax * env;
    const dir = angle + da;
    const rho = t * R;
    points.push({ x: ix + Math.cos(dir) * rho, y: iy + Math.sin(dir) * rho });
    params.push(t);
  }
  points.push(boundary);
  params.push(1);
  // Guard strict ascendance of params (defensive against jitter collisions).
  for (let i = 1; i < params.length; i++) {
    if (params[i] <= params[i - 1]) params[i] = Math.min(1, params[i - 1] + 1e-4);
  }
  return { angle, R, points, params };
}

/** Build the glass fracture ONCE (deterministic). Returns the impact point and
 * the fragment list (union = the field rect at rest). */
export function buildShards(options: BuildShardsOptions = {}): {
  impact: Point;
  shards: Shard[];
} {
  const ix = clamp01(options.impactFx ?? DEFAULT_IMPACT_FX) * VIEW_W;
  const iy = clamp01(options.impactFy ?? DEFAULT_IMPACT_FY) * VIEW_H;
  const impact: Point = { x: ix, y: iy };

  // Angles: jittered base rays + one ray straight at each corner (so no sector
  // ever straddles a corner -> every outer band edge lies on the rect edge).
  const rawAngles: number[] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const jitter = (hash01(i * 2 + 1) - 0.5) * ((Math.PI * 2) / RAY_COUNT) * 0.6;
    rawAngles.push((i / RAY_COUNT) * Math.PI * 2 + jitter);
  }
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: VIEW_W, y: 0 },
    { x: VIEW_W, y: VIEW_H },
    { x: 0, y: VIEW_H },
  ];
  for (const c of corners) rawAngles.push(Math.atan2(c.y - iy, c.x - ix));
  const angles = rawAngles
    .map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
    .sort((a, b) => a - b);

  const n = angles.length;
  const primaries: Primary[] = [];
  for (let k = 0; k < n; k++) {
    const prev = angles[(k - 1 + n) % n];
    const nextA = angles[(k + 1) % n];
    const gap = Math.min(circularGap(angles[k], prev), circularGap(angles[k], nextA));
    primaries.push(buildPrimary(ix, iy, angles[k], gap, k + 1));
  }

  const maxR = Math.max(...primaries.map((p) => p.R), 1e-6);

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
    shards.push({ points, cx, cy, dirX: dx, dirY: dy, distNorm: clamp01(len / maxR), seed });
  };

  for (let k = 0; k < n; k++) {
    const A = primaries[k];
    const B = primaries[(k + 1) % n];
    // Radial band boundaries: the two near-impact splits (splintery cells by
    // the impact) plus at most MAX_MID_BOUNDS mid-range kink params sampled
    // evenly from both primaries' kinks. Capping the band count keeps the
    // shard total ~60 instead of 120+ -- each shard paints the full clipped
    // lockup every frame, so shard count is the hero's paint budget.
    const near1 = 0.045 + (hash01(k * 23 + 1) - 0.5) * 0.02;
    const near2 = 0.11 + (hash01(k * 23 + 2) - 0.5) * 0.03;
    const kinkSet = new Set<number>([...A.params, ...B.params]);
    const mids = [...kinkSet].filter((v) => v > 0.15 && v < 1 - 1e-9).sort((a, b) => a - b);
    const MAX_MID_BOUNDS = 2;
    const chosen: number[] = [];
    for (let m = 0; m < Math.min(MAX_MID_BOUNDS, mids.length); m++) {
      const idx = Math.floor(((m + 1) * mids.length) / (Math.min(MAX_MID_BOUNDS, mids.length) + 1));
      chosen.push(mids[Math.min(idx, mids.length - 1)]);
    }
    const fs = [...new Set([0, near1, near2, ...chosen, 1])]
      .filter((v) => v >= 0 && v <= 1)
      .sort((a, b) => a - b);

    for (let j = 1; j < fs.length; j++) {
      const f0 = fs[j - 1];
      const f1 = fs[j];
      const aOuter = evalPrimary(A, f1);
      const bOuter = evalPrimary(B, f1);
      const seed = k * 131 + j * 17 + 1;
      if (f0 <= 1e-9) {
        pushShard([impact, bOuter, aOuter], seed); // apex triangle.
      } else {
        const aInner = evalPrimary(A, f0);
        const bInner = evalPrimary(B, f0);
        pushShard([aInner, bInner, bOuter, aOuter], seed);
      }
    }
  }

  return { impact, shards };
}

/** Pure per-shard transform: same (progress, shard) -> same result. shatter is
 * 0 at p = 0 (identity -> pixel-perfect reassembly) and a FULL, HELD 1 at p = 1.
 * Displacement is along the shard's radial vector from the impact; nearer-impact
 * shards lead and travel farther. */
export function shardTransform(progress: number, shard: Shard): ShardTransform {
  const amount = shatterAmount(progress);

  const exponent = 0.7 + shard.distNorm * 0.8; // 0.7 (near) .. 1.5 (far).
  const staggered = Math.pow(amount, exponent);
  const reach = 1.0 - shard.distNorm * 0.5; // 1.0 (near) .. 0.5 (far).

  const spin = hash01(shard.seed * 3 + 1) * 2 - 1; // [-1, 1]
  const scaleDelta = -0.08 + hash01(shard.seed * 3 + 2) * 0.14; // [-0.08, +0.06]

  const mag = MAX_TRANSLATE * reach * staggered;
  const tx = shard.dirX * mag;
  const ty = shard.dirY * mag;
  const rot = spin * MAX_ROTATE_DEG * staggered;
  const scale = 1 + scaleDelta * staggered;
  const opacity = 1 - (1 - MIN_OPACITY) * staggered;

  return { tx, ty, rot, scale, opacity };
}
