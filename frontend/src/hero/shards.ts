// Pure shard geometry + transform math for the reactive wordmark --
// docs/design/08-landing-hero.md. Kept DOM-free so purity and the
// reassemble-at-extremes contract are unit-testable without rendering SVG.
//
// SHATTER RULE (resolution of a genuine contradiction in doc 08):
//   Doc 08 says both (a) "displacement proportional to |progress -
//   SHOT_MOMENT|" AND (b) fragments "reassemble to a pixel-perfect lockup
//   at progress extremes" (0 and 1). Read literally, (a) makes displacement
//   MAXIMAL at the extremes (|1-0.35| = 0.65), directly contradicting (b).
//   Both the doc's own narrative ("shatter ... as progress crosses ...
//   recombine as progress returns") and the acceptance test ("identity at
//   extremes") require (b) to win. We therefore encode a SIDE-NORMALIZED
//   tent that IS a pure function of |progress - SHOT_MOMENT| yet is zero at
//   both extremes and peaks at SHOT_MOMENT:
//
//     u = |progress - SHOT_MOMENT| / (progress < SHOT_MOMENT
//                                       ? SHOT_MOMENT
//                                       : 1 - SHOT_MOMENT)      // u in [0,1]
//     shatter = smoothstep(1 - u)     // 1 at the shot, 0 at each extreme
//
//   This satisfies (b) exactly (u=1 at both extremes -> shatter=0 ->
//   zero displacement) while remaining monotone in distance from the shot,
//   which is the honest intent of (a): the lockup is whole when parked at
//   either end and blows apart at the muzzle flash. All per-shard vectors
//   are seeded ONCE from the shard index (no RNG state, no per-frame
//   randomness) so the map is a pure function of (progress, seedIndex).

import { SHOT_MOMENT } from "./timeline";

/** Max per-shard translation in SVG user units (viewBox is 640x240). */
const MAX_TRANSLATE = 150;
/** Max per-shard rotation at full shatter, degrees. */
const MAX_ROTATE_DEG = 40;
/** Max per-shard scale delta at full shatter (slight, +/-). */
const MAX_SCALE_DELTA = 0.28;
/** Opacity floor at full shatter (motion-blur-suggesting falloff). */
const MIN_OPACITY = 0.35;

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
  // half is only 0 in the degenerate SHOT_MOMENT in {0,1}; guard anyway.
  const u = half > 0 ? dist / half : 0;
  return smoothstep(1 - u);
}

/** Pure per-shard transform: same (progress, seedIndex) -> same result.
 * At progress 0 and 1 returns the identity transform for every shard, so
 * the fragments reassemble pixel-perfect. */
export function shardTransform(progress: number, seedIndex: number): ShardTransform {
  const amount = shatterAmount(progress);

  // Seed a stable outward vector, spin, and scale sign from the index.
  const angle = hash01(seedIndex * 3 + 1) * Math.PI * 2;
  const mag = 0.45 + hash01(seedIndex * 3 + 2) * 0.55; // [0.45, 1]
  const spin = hash01(seedIndex * 3 + 3) * 2 - 1; // [-1, 1]
  const scaleSign = hash01(seedIndex * 7 + 5) < 0.5 ? -1 : 1;

  const tx = Math.cos(angle) * mag * MAX_TRANSLATE * amount;
  const ty = Math.sin(angle) * mag * MAX_TRANSLATE * amount;
  const rot = spin * MAX_ROTATE_DEG * amount;
  const scale = 1 + scaleSign * MAX_SCALE_DELTA * amount;
  const opacity = 1 - (1 - MIN_OPACITY) * amount;

  return { tx, ty, rot, scale, opacity };
}
