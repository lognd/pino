import { describe, it, expect } from "vitest";
import { buildBullethole, SIZE } from "../../src/hero/Bullethole";
import { buildBranch, hash01 } from "../../src/hero/branching";

// docs/design/08-landing-hero.md (Revision 4): the bullet hole is layered glass
// damage -- irregular core, crushed ring, kinked BRANCHING radial cracks (via
// the SHARED branching generator), tangential connectors -- all seeded from the
// click position so no two holes repeat but each is deterministic per seed.

describe("hero/branching.ts buildBranch (shared generator)", () => {
  it("produces a kinked polyline (never a straight line) deterministically", () => {
    const a = buildBranch({ x: 0, y: 0 }, 1, 0, 20, 4, 42, 0.5);
    const b = buildBranch({ x: 0, y: 0 }, 1, 0, 20, 4, 42, 0.5);
    expect(a).toEqual(b); // pure/deterministic
    expect(a.length).toBe(5); // segs + 1
    // Genuinely kinked: at least one vertex leaves the straight chord.
    const off = a.some((p) => Math.abs(p.y) > 0.5);
    expect(off).toBe(true);
  });

  it("hash01 is stable per seed", () => {
    expect(hash01(7)).toBe(hash01(7));
    expect(hash01(7)).not.toBe(hash01(8));
  });
});

describe("hero/Bullethole.ts buildBullethole", () => {
  it("is deterministic per seed (identical geometry, no drift)", () => {
    const a = buildBullethole(12345);
    const b = buildBullethole(12345);
    expect(a).toEqual(b);
  });

  it("differs across seeds (no two holes repeat)", () => {
    const a = buildBullethole(1);
    const b = buildBullethole(2);
    expect(a.core).not.toEqual(b.core);
    expect(a.cracks.length !== b.cracks.length || a.cracks[0].points).not.toEqual(
      b.cracks[0]?.points,
    );
  });

  it("builds an irregular (non-circular) core polygon", () => {
    const g = buildBullethole(999);
    expect(g.core.length).toBeGreaterThanOrEqual(8);
    // Radii from the centre vary -> not a circle.
    const radii = g.core.map((p) => Math.hypot(p.x - SIZE / 2, p.y - SIZE / 2));
    const min = Math.min(...radii);
    const max = Math.max(...radii);
    expect(max - min).toBeGreaterThan(1);
  });

  it("emits radial cracks plus branches and tangential connectors, with opacity variance", () => {
    const g = buildBullethole(555);
    // 6-9 radials + ~half spawn a branch + 2-3 connectors -> comfortably many.
    expect(g.cracks.length).toBeGreaterThanOrEqual(8);
    for (const c of g.cracks) {
      expect(c.points.length).toBeGreaterThanOrEqual(2);
      expect(c.opacity).toBeGreaterThan(0);
      expect(c.opacity).toBeLessThanOrEqual(1);
      expect(c.width).toBeGreaterThan(0);
    }
    // Opacity genuinely varies across cracks (per-crack variance).
    const opacities = g.cracks.map((c) => c.opacity);
    expect(Math.max(...opacities) - Math.min(...opacities)).toBeGreaterThan(0.05);
  });
});
