import { describe, it, expect } from "vitest";
import {
  buildShards,
  shardTransform,
  shatterAmount,
  VIEW_W,
  VIEW_H,
  type Shard,
} from "../../src/hero/shards";
import { SHOT_MOMENT } from "../../src/hero/timeline";

// docs/design/08-landing-hero.md (Revision 3/4) shard obligations: purity, the
// held shatter envelope (0 until SHOT_MOMENT, monotone-rising to a FULL, HELD 1
// at p = 1, identity only at p = 0), the branched/fractal kinked tessellation,
// fragments tiling the field, and each fragment displacing ALONG its radial
// vector from the impact. Revision 4 removed the rendered crack-line overlay, so
// buildShards no longer emits a crack list.

const built = buildShards();
const IMPACT = built.impact;
const SHARDS: Shard[] = built.shards;

const magOf = (t: { tx: number; ty: number }) => Math.hypot(t.tx, t.ty);

describe("hero/shards.ts shatterAmount (Revision 3 held envelope)", () => {
  it("is exactly 0 at and below SHOT_MOMENT", () => {
    expect(shatterAmount(0)).toBe(0);
    expect(shatterAmount(SHOT_MOMENT / 2)).toBe(0);
    expect(shatterAmount(SHOT_MOMENT)).toBe(0);
  });

  it("is FULL (1) and HELD at p = 1 and beyond", () => {
    expect(shatterAmount(1)).toBeCloseTo(1, 6);
    expect(shatterAmount(1.5)).toBe(shatterAmount(1)); // clamped/held.
  });

  it("is monotone non-decreasing across [0,1]", () => {
    let prev = -1;
    for (let p = 0; p <= 1.00001; p += 0.02) {
      const a = shatterAmount(p);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
  });

  it("rises strictly between SHOT_MOMENT and 1", () => {
    expect(shatterAmount(0.5)).toBeGreaterThan(0);
    expect(shatterAmount(0.8)).toBeGreaterThan(shatterAmount(0.5));
    expect(shatterAmount(1)).toBeGreaterThan(shatterAmount(0.8));
  });
});

describe("hero/shards.ts buildShards (branched-crack tessellation)", () => {
  it("produces a non-trivial fracture with all vertices inside the field", () => {
    expect(SHARDS.length).toBeGreaterThan(12);
    for (const shard of SHARDS) {
      for (const p of shard.points) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(VIEW_W + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(VIEW_H + 1e-6);
      }
      expect(shard.distNorm).toBeGreaterThanOrEqual(0);
      expect(shard.distNorm).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: the same seed rebuilds identical geometry", () => {
    const again = buildShards();
    expect(again.shards.length).toBe(SHARDS.length);
    expect(again.shards[3].points).toEqual(SHARDS[3].points);
  });
});

describe("hero/shards.ts shardTransform", () => {
  it("produces identical transforms for the same (progress, shard) (purity)", () => {
    for (const shard of SHARDS) {
      expect(shardTransform(0.6, shard)).toEqual(shardTransform(0.6, shard));
    }
  });

  it("reassembles to the identity lockup ONLY at progress 0", () => {
    for (const shard of SHARDS) {
      const t = shardTransform(0, shard);
      expect(t.tx).toBeCloseTo(0, 10);
      expect(t.ty).toBeCloseTo(0, 10);
      expect(t.rot).toBeCloseTo(0, 10);
      expect(t.scale).toBe(1);
      expect(t.opacity).toBe(1);
    }
    // At p = 1 the lockup is HELD shattered -> at least one shard has moved.
    const moved = SHARDS.some((s) => magOf(shardTransform(1, s)) > 1);
    expect(moved).toBe(true);
  });

  it("displaces each fragment ALONG its radial vector from the impact (outward)", () => {
    for (const shard of SHARDS) {
      const t = shardTransform(1, shard);
      if (magOf(t) < 1e-6) continue;
      const rx = shard.cx - IMPACT.x;
      const ry = shard.cy - IMPACT.y;
      const cross = t.tx * ry - t.ty * rx;
      expect(Math.abs(cross)).toBeLessThan(1e-3);
      expect(t.tx * rx + t.ty * ry).toBeGreaterThan(0);
    }
  });

  it("nearer-impact fragments travel farther at full shatter (p = 1)", () => {
    const sorted = [...SHARDS].sort((a, b) => a.distNorm - b.distNorm);
    const near = sorted[0];
    const far = sorted[sorted.length - 1];
    expect(near.distNorm).toBeLessThan(far.distNorm);
    expect(magOf(shardTransform(1, near))).toBeGreaterThan(magOf(shardTransform(1, far)));
  });

  it("nearer-impact fragments lead (move earlier) partway through the shatter", () => {
    const sorted = [...SHARDS].sort((a, b) => a.distNorm - b.distNorm);
    const near = sorted[0];
    const far = sorted[sorted.length - 1];
    // Just past the shot the near fragment is already displacing more.
    expect(magOf(shardTransform(0.5, near))).toBeGreaterThan(magOf(shardTransform(0.5, far)));
  });

  it("keeps opacity near-solid and scale subtle at full shatter (Revision 5)", () => {
    for (const shard of SHARDS) {
      const t = shardTransform(1, shard);
      expect(t.opacity).toBeGreaterThanOrEqual(0.79);
      expect(t.opacity).toBeLessThanOrEqual(1);
      expect(t.scale).toBeGreaterThanOrEqual(0.96);
      expect(t.scale).toBeLessThanOrEqual(1.04);
    }
  });
});
