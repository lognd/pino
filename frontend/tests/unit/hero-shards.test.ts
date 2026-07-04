import { describe, it, expect } from "vitest";
import { shardTransform, shatterAmount } from "../../src/hero/shards";
import { SHOT_MOMENT } from "../../src/hero/timeline";

// docs/design/08-landing-hero.md shard obligations: purity, the shatter
// rule (peaks at SHOT_MOMENT), and pixel-perfect reassembly at extremes.

const SHARD_COUNT = 16;

describe("hero/shards.ts shardTransform", () => {
  it("produces identical transforms for the same (progress, index) (purity)", () => {
    for (let i = 0; i < SHARD_COUNT; i++) {
      const a = shardTransform(0.6, i);
      const b = shardTransform(0.6, i);
      expect(a).toEqual(b);
    }
  });

  it("reassembles to the identity lockup at progress 0 and 1", () => {
    for (const p of [0, 1]) {
      for (let i = 0; i < SHARD_COUNT; i++) {
        const t = shardTransform(p, i);
        // -0 and +0 are pixel-identical in SVG; compare by magnitude.
        expect(t.tx).toBeCloseTo(0, 10);
        expect(t.ty).toBeCloseTo(0, 10);
        expect(t.rot).toBeCloseTo(0, 10);
        expect(t.scale).toBe(1);
        expect(t.opacity).toBe(1);
      }
    }
  });

  it("shatter peaks (max displacement) at SHOT_MOMENT", () => {
    expect(shatterAmount(SHOT_MOMENT)).toBeCloseTo(1, 6);
    expect(shatterAmount(0)).toBeCloseTo(0, 6);
    expect(shatterAmount(1)).toBeCloseTo(0, 6);
    // Displacement magnitude at the shot exceeds displacement partway out.
    const atShot = shardTransform(SHOT_MOMENT, 3);
    const partway = shardTransform((SHOT_MOMENT + 1) / 2, 3);
    const mag = (t: { tx: number; ty: number }) => Math.hypot(t.tx, t.ty);
    expect(mag(atShot)).toBeGreaterThan(mag(partway));
  });

  it("displacement is monotone in the shatter envelope on each side", () => {
    // Approaching the shot from the left, shatter rises monotonically.
    let prev = -1;
    for (let p = 0; p <= SHOT_MOMENT; p += 0.02) {
      const a = shatterAmount(p);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
    // Leaving the shot to the right, shatter falls monotonically.
    prev = 2;
    for (let p = SHOT_MOMENT; p <= 1; p += 0.02) {
      const a = shatterAmount(p);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it("keeps opacity within [floor, 1] and scale near 1", () => {
    for (let i = 0; i < SHARD_COUNT; i++) {
      const t = shardTransform(SHOT_MOMENT, i);
      expect(t.opacity).toBeGreaterThanOrEqual(0.34);
      expect(t.opacity).toBeLessThanOrEqual(1);
      expect(Math.abs(t.scale - 1)).toBeLessThanOrEqual(0.3);
    }
  });
});
