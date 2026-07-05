// Shared branching-polyline generator -- docs/design/08-landing-hero.md
// (Revision 4). ONE home for the kinked/recursive crack math so the wordmark
// shatter (shards.ts) and the bullet-hole glass damage (Bullethole.tsx) share
// the exact same generator instead of keeping two copies (NO DUPLICATION rule).
//
// Everything here is pure and deterministic: a seed integer fully determines
// the geometry, so callers get identical output for identical seeds. No DOM,
// no time, no allocation beyond the returned arrays.

export interface Point {
  x: number;
  y: number;
}

/** Deterministic [0,1) hash of an integer seed (mulberry32 mix, stateless). */
export function hash01(seed: number): number {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Build a short KINKED branch polyline from a start point along a direction:
 * `segs` segments of length `length/segs`, each turning by a seeded angular
 * jitter (+/- `jitter` radians). This is the primitive both the wordmark cracks
 * and the bullet-hole cracks fracture with -- the same "never a straight line"
 * morphology. Pure: same args -> same points. */
export function buildBranch(
  start: Point,
  dirX: number,
  dirY: number,
  length: number,
  segs: number,
  seed: number,
  jitter = 0.5,
): Point[] {
  const pts: Point[] = [{ x: start.x, y: start.y }];
  let x = start.x;
  let y = start.y;
  let ang = Math.atan2(dirY, dirX);
  const stepLen = length / Math.max(1, segs);
  for (let i = 1; i <= segs; i++) {
    ang += (hash01(seed * 19 + i) - 0.5) * jitter; // per-segment angular jitter.
    x += Math.cos(ang) * stepLen;
    y += Math.sin(ang) * stepLen;
    pts.push({ x, y });
  }
  return pts;
}
