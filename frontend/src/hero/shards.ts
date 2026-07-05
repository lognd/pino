// Pure shard geometry + transform math for the reactive wordmark --
// docs/design/08-landing-hero.md (Revision 3). Kept DOM-free so purity and
// the reassemble-at-0 contract are unit-testable without rendering SVG.
//
// SHATTER ENVELOPE (Revision 3 -- supersedes Revision 2's tent rule; binding
// user feedback: "keep the shatter effect when the cursor is all the way to
// the right; on inaction, the Mel Pino should come back together"):
//
//     shatter(p) = 0                                          for p <= SHOT_MOMENT
//                = smoothstep((p - SHOT_MOMENT)/(1 - SHOT))   rising to 1 at p = 1
//
//   The envelope HOLDS at full (1) at the right extreme -- parking the cursor
//   full-right leaves the lockup blown apart. It is monotone non-decreasing
//   everywhere, and equals 0 (pixel-perfect identity) ONLY at p = 0. Idle
//   settle-home always eases to 0 (scrubMachine.ts), so on inaction MEL PINO
//   drifts back together every time. Still a pure function of progress.
//
// BRANCHED, FRACTAL-LIKE CRACK NETWORK (Revision 3 -- user verdict on the
// Revision 2 radial tessellation: "just lines", "need to be more branchy and
// fractal-like"): instead of straight spokes, the lockup fractures around an
// IMPACT POINT (timeline.ts ORIGIN_*) into a recursively branched network:
//
//   * PRIMARY cracks radiate from the impact as KINKED POLYLINES (3-6 segments
//     each, per-segment angular jitter -- never one straight line). Each stays
//     inside its own angular wedge (lateral deviation bounded by the gap to its
//     neighbours), so primaries never cross -> the cells they bound tile the
//     rect exactly at p = 0 (union = rect, no gaps/overlaps; T-junctions across
//     a shared primary are harmless -- both sides trace the identical polyline).
//   * SECONDARY branches (1-3 per primary) split off at random points, deviate
//     20-45deg, and are shorter and kinked. TERTIARY branches spawn near the
//     impact off near-impact secondaries. Secondaries/tertiaries are RENDERED
//     as hairlines (Wordmark.tsx) but do not subdivide cells -- the branchy
//     visible network is what sells glass.
//   * SHARDS are the cells of the primary network: an angular sector between
//     two adjacent kinked primaries, split into radial BANDS at the union of
//     both primaries' kink parameters (so every sector-boundary cell edge
//     follows a real kinked crack polyline, not a straight chord) plus a couple
//     of near-impact splits (splintery near the impact, large slabs at the
//     periphery).
//
// Per-shard motion keeps Revision 2's depth cues -- displacement ALONG the
// radial vector from the impact, deterministic stagger (nearer-impact shards
// lead and travel farther), rotation, scale, opacity falloff -- now along the
// kinked paths. All randomness is seeded ONCE from indices, so buildShards and
// shardTransform are pure/deterministic.

import { SHOT_MOMENT, ORIGIN_FY } from "./timeline";

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

export interface Point {
  x: number;
  y: number;
}

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

/** One polyline in the rendered crack network. */
export interface Crack {
  /** Polyline vertices (>= 2). */
  points: Point[];
  /** 1 = primary, 2 = secondary, 3 = tertiary. */
  generation: 1 | 2 | 3;
  /** Brightness hint in [0,1]: higher = nearer the impact (brighter stroke). */
  intensity: number;
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

/** Shatter amount in [0,1]: 0 for p <= SHOT_MOMENT, then smoothstep-rising to
 * a FULL, HELD 1 at p = 1 (Revision 3 envelope). Monotone non-decreasing; 0
 * only at p = 0. Exported for tests, for the wordmark's crack opacity, and for
 * the source to share the same envelope. */
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
    // Evenly spaced interior params with jitter, kept strictly ascending.
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

/** Local unit direction of a primary at radius fraction f (for branching). */
function primaryDirection(prim: Primary, f: number): { x: number; y: number } {
  const a = evalPrimary(prim, Math.max(0, f - 0.03));
  const b = evalPrimary(prim, Math.min(1, f + 0.03));
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return { x: dx, y: dy };
}

/** Build a short kinked branch polyline from a start point along a direction. */
function buildBranch(
  start: Point,
  dirX: number,
  dirY: number,
  length: number,
  segs: number,
  seed: number,
): Point[] {
  const pts: Point[] = [start];
  let x = start.x;
  let y = start.y;
  let ang = Math.atan2(dirY, dirX);
  const step = length / segs;
  for (let i = 1; i <= segs; i++) {
    ang += (hash01(seed * 19 + i) - 0.5) * 0.5; // per-segment angular jitter.
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push({ x, y });
  }
  return pts;
}

/** Build the glass fracture ONCE (deterministic). Returns the impact point,
 * the fragment list (union = the field rect at rest), and the rendered crack
 * network (primaries + secondary/tertiary branches). */
export function buildShards(options: BuildShardsOptions = {}): {
  impact: Point;
  shards: Shard[];
  cracks: Crack[];
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
    const next = angles[(k + 1) % n];
    const gap = Math.min(circularGap(angles[k], prev), circularGap(angles[k], next));
    primaries.push(buildPrimary(ix, iy, angles[k], gap, k + 1));
  }

  const maxR = Math.max(...primaries.map((p) => p.R), 1e-6);

  // --- cells: sector bands between adjacent kinked primaries -----------------
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
    // Band params: union of both primaries' kink params (so sector-boundary
    // edges follow the real kinked cracks), plus a couple of near-impact splits
    // to make the inner cells small and splintery.
    const set = new Set<number>([...A.params, ...B.params]);
    set.add(0.045 + (hash01(k * 23 + 1) - 0.5) * 0.02);
    set.add(0.11 + (hash01(k * 23 + 2) - 0.5) * 0.03);
    const fs = [...set].filter((v) => v >= 0 && v <= 1).sort((a, b) => a - b);

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

  // --- rendered crack network: primaries + secondaries + tertiaries ----------
  const cracks: Crack[] = [];
  const intensityOf = (pts: Point[]): number => {
    const mid = pts[Math.floor(pts.length / 2)];
    const d = Math.hypot(mid.x - ix, mid.y - iy);
    return clamp01(1 - d / maxR);
  };
  for (let k = 0; k < n; k++) {
    const A = primaries[k];
    cracks.push({ points: A.points, generation: 1, intensity: intensityOf(A.points) });
    // 1..3 secondary branches off this primary.
    const secCount = 1 + Math.floor(hash01(k * 29 + 3) * 3);
    for (let s = 0; s < secCount; s++) {
      const f = 0.25 + hash01(k * 31 + s * 3 + 1) * 0.55; // along the primary.
      const start = evalPrimary(A, f);
      const dir = primaryDirection(A, f);
      const side = hash01(k * 31 + s * 3 + 2) < 0.5 ? 1 : -1;
      const dev = ((20 + hash01(k * 31 + s * 3 + 3) * 25) * Math.PI) / 180; // 20-45deg.
      const c = Math.cos(dev * side);
      const sn = Math.sin(dev * side);
      const bx = dir.x * c - dir.y * sn;
      const by = dir.x * sn + dir.y * c;
      const length = A.R * (0.15 + hash01(k * 37 + s) * 0.25);
      const segs = 2 + Math.floor(hash01(k * 41 + s) * 2);
      const branch = buildBranch(start, bx, by, length, segs, k * 53 + s * 7 + 1);
      cracks.push({ points: branch, generation: 2, intensity: intensityOf(branch) });
      // Tertiary near the impact only (small f).
      if (f < 0.45 && hash01(k * 43 + s) < 0.6) {
        const tf = 0.4 + hash01(k * 47 + s) * 0.4;
        const tStart = {
          x: branch[0].x + (branch[branch.length - 1].x - branch[0].x) * tf,
          y: branch[0].y + (branch[branch.length - 1].y - branch[0].y) * tf,
        };
        const tSide = hash01(k * 47 + s + 1) < 0.5 ? 1 : -1;
        const tDev = ((22 + hash01(k * 47 + s + 2) * 20) * Math.PI) / 180;
        const tc = Math.cos(tDev * tSide);
        const ts = Math.sin(tDev * tSide);
        const tbx = bx * tc - by * ts;
        const tby = bx * ts + by * tc;
        const tertiary = buildBranch(tStart, tbx, tby, length * 0.5, 2, k * 59 + s * 11 + 1);
        cracks.push({ points: tertiary, generation: 3, intensity: intensityOf(tertiary) });
      }
    }
  }

  return { impact, shards, cracks };
}

/** Pure per-shard transform: same (progress, shard) -> same result. shatter is
 * 0 at p = 0 (identity -> pixel-perfect reassembly) and a FULL, HELD 1 at
 * p = 1 (lockup stays blown apart at the right extreme). Displacement is along
 * the shard's radial vector from the impact; nearer-impact shards lead and
 * travel farther. */
export function shardTransform(progress: number, shard: Shard): ShardTransform {
  const amount = shatterAmount(progress);

  // Deterministic stagger: nearer the impact (distNorm ~ 0) rises earlier
  // (smaller exponent -> concave) and reaches farther; the periphery lags.
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
