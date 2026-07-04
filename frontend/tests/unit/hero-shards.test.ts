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

// docs/design/08-landing-hero.md (Revision 2) shard obligations: purity, the
// shatter envelope (peaks at SHOT_MOMENT), pixel-perfect reassembly at the
// extremes, and the NEW radial-crack rules -- fragments tile the field, and
// each fragment displaces ALONG its radial vector from the impact point with
// nearer-impact fragments leading and travelling farther.

const built = buildShards();
const IMPACT = built.impact;
const SHARDS: Shard[] = built.shards;

const magOf = (t: { tx: number; ty: number }) => Math.hypot(t.tx, t.ty);

describe("hero/shards.ts buildShards (radial-crack tessellation)", () => {
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
});

describe("hero/shards.ts shardTransform", () => {
  it("produces identical transforms for the same (progress, shard) (purity)", () => {
    for (const shard of SHARDS) {
      expect(shardTransform(0.6, shard)).toEqual(shardTransform(0.6, shard));
    }
  });

  it("reassembles to the identity lockup at progress 0 and 1", () => {
    for (const p of [0, 1]) {
      for (const shard of SHARDS) {
        const t = shardTransform(p, shard);
        expect(t.tx).toBeCloseTo(0, 10);
        expect(t.ty).toBeCloseTo(0, 10);
        expect(t.rot).toBeCloseTo(0, 10);
        expect(t.scale).toBe(1);
        expect(t.opacity).toBe(1);
      }
    }
  });

  it("shatter peaks (max displacement) at SHOT_MOMENT and is zero at extremes", () => {
    expect(shatterAmount(SHOT_MOMENT)).toBeCloseTo(1, 6);
    expect(shatterAmount(0)).toBeCloseTo(0, 6);
    expect(shatterAmount(1)).toBeCloseTo(0, 6);
    const shard = SHARDS[Math.floor(SHARDS.length / 2)];
    const atShot = shardTransform(SHOT_MOMENT, shard);
    const partway = shardTransform((SHOT_MOMENT + 1) / 2, shard);
    expect(magOf(atShot)).toBeGreaterThan(magOf(partway));
  });

  it("shatter envelope is monotone on each side of SHOT_MOMENT", () => {
    let prev = -1;
    for (let p = 0; p <= SHOT_MOMENT; p += 0.02) {
      const a = shatterAmount(p);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
    prev = 2;
    for (let p = SHOT_MOMENT; p <= 1; p += 0.02) {
      const a = shatterAmount(p);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it("displaces each fragment ALONG its radial vector from the impact", () => {
    for (const shard of SHARDS) {
      const t = shardTransform(SHOT_MOMENT, shard);
      if (magOf(t) < 1e-6) continue;
      const rx = shard.cx - IMPACT.x;
      const ry = shard.cy - IMPACT.y;
      // Parallel to the impact->centroid ray: cross product ~ 0.
      const cross = t.tx * ry - t.ty * rx;
      expect(Math.abs(cross)).toBeLessThan(1e-3);
      // And outward (away from the impact), not inward.
      expect(t.tx * rx + t.ty * ry).toBeGreaterThan(0);
    }
  });

  it("nearer-impact fragments travel farther at full shatter", () => {
    const sorted = [...SHARDS].sort((a, b) => a.distNorm - b.distNorm);
    const near = sorted[0];
    const far = sorted[sorted.length - 1];
    expect(near.distNorm).toBeLessThan(far.distNorm);
    expect(magOf(shardTransform(SHOT_MOMENT, near))).toBeGreaterThan(
      magOf(shardTransform(SHOT_MOMENT, far)),
    );
  });

  it("nearer-impact fragments lead (move earlier) partway to the shot", () => {
    const sorted = [...SHARDS].sort((a, b) => a.distNorm - b.distNorm);
    const near = sorted[0];
    const far = sorted[sorted.length - 1];
    // Well before the shot the near fragment is already displacing more.
    expect(magOf(shardTransform(0.15, near))).toBeGreaterThan(
      magOf(shardTransform(0.15, far)),
    );
  });

  it("keeps opacity within [floor, 1] and scale within 0.92-1.06", () => {
    for (const shard of SHARDS) {
      const t = shardTransform(SHOT_MOMENT, shard);
      expect(t.opacity).toBeGreaterThanOrEqual(0.41);
      expect(t.opacity).toBeLessThanOrEqual(1);
      expect(t.scale).toBeGreaterThanOrEqual(0.91);
      expect(t.scale).toBeLessThanOrEqual(1.07);
    }
  });
});
