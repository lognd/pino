import { describe, it, expect } from "vitest";
import {
  createPiecePhysics,
  stepPiecePhysics,
  MAX_OFFSET,
  CURSOR_RADIUS,
  type PiecePhysicsState,
} from "../../src/hero/piecePhysics";
import { buildShards, type Shard } from "../../src/hero/shards";

// docs/design/08-landing-hero.md (Revision 7): baby physics sim for the
// fractured pieces -- instant float on separation, spring home, hard bounds,
// cursor repulsion, SUPERHOT time flow (dt scaling), exact zero at rest.

const PIECES: Shard[] = buildShards().shards;

function freshState(): PiecePhysicsState {
  return createPiecePhysics(PIECES.length);
}

function basePositions(): { bx: Float32Array; by: Float32Array } {
  const bx = new Float32Array(PIECES.length);
  const by = new Float32Array(PIECES.length);
  for (let i = 0; i < PIECES.length; i++) {
    bx[i] = PIECES[i].cx;
    by[i] = PIECES[i].cy;
  }
  return { bx, by };
}

/** Step `state` for `ms` at 60fps with fixed shatter/pointer. */
function run(
  state: PiecePhysicsState,
  ms: number,
  shatter: number,
  pointer: { x: number; y: number } | null = null,
): void {
  const { bx, by } = basePositions();
  for (let t = 0; t < ms; t += 16.7) {
    stepPiecePhysics(state, PIECES, bx, by, {
      dtMs: 16.7,
      shatter,
      pointerX: pointer?.x ?? null,
      pointerY: pointer?.y ?? null,
    });
  }
}

function maxOffsetMag(state: PiecePhysicsState): number {
  let m = 0;
  for (let i = 0; i < PIECES.length; i++) {
    m = Math.max(m, Math.hypot(state.ox[i], state.oy[i]));
  }
  return m;
}

describe("hero/piecePhysics.ts (Revision 7 baby sim)", () => {
  it("floats INSTANTLY on separation (visible movement within ~150ms)", () => {
    const s = freshState();
    run(s, 150, 0.1); // barely separated -- gate is already fully on
    expect(maxOffsetMag(s)).toBeGreaterThan(0.3);
  });

  it("stays hard-bounded forever (a float, never a scatter)", () => {
    const s = freshState();
    run(s, 30000, 1);
    expect(maxOffsetMag(s)).toBeLessThanOrEqual(MAX_OFFSET * Math.SQRT2 + 1e-6);
  });

  it("snaps to exact zero when no longer separated (reassembly contract)", () => {
    const s = freshState();
    run(s, 2000, 1);
    expect(maxOffsetMag(s)).toBeGreaterThan(0);
    run(s, 16.7, 0); // shatter collapsed
    expect(maxOffsetMag(s)).toBe(0);
    for (let i = 0; i < PIECES.length; i++) {
      expect(s.vx[i]).toBe(0);
      expect(s.vy[i]).toBe(0);
    }
  });

  it("SUPERHOT: zero-dt steps freeze the float exactly", () => {
    const s = freshState();
    run(s, 1000, 1);
    const before = [...s.ox];
    const { bx, by } = basePositions();
    for (let i = 0; i < 60; i++) {
      stepPiecePhysics(s, PIECES, bx, by, { dtMs: 0, shatter: 1, pointerX: null, pointerY: null });
    }
    expect([...s.ox]).toEqual(before);
  });

  it("cursor pushes nearby pieces AWAY (repulsion, not attraction)", () => {
    const s = freshState();
    const { bx, by } = basePositions();
    // Park the pointer exactly on piece 0's base position, slightly offset.
    const target = 0;
    const pointer = { x: bx[target] - 10, y: by[target] };
    for (let t = 0; t < 600; t += 16.7) {
      stepPiecePhysics(s, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 1,
        pointerX: pointer.x,
        pointerY: pointer.y,
      });
    }
    // Piece 0 must have moved away from the pointer (positive x offset
    // component along pointer->piece direction), beyond wander noise scale.
    expect(s.ox[target]).toBeGreaterThan(2);
  });

  it("ignores the cursor beyond the repulsion radius", () => {
    const withPointer = freshState();
    const without = freshState();
    const { bx, by } = basePositions();
    const far = { x: bx[0] + CURSOR_RADIUS * 3, y: by[0] };
    for (let t = 0; t < 600; t += 16.7) {
      stepPiecePhysics(withPointer, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 1,
        pointerX: far.x,
        pointerY: far.y,
      });
      stepPiecePhysics(without, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 1,
        pointerX: null,
        pointerY: null,
      });
    }
    // Identical evolution for piece 0 (the far pointer exerts no force on it).
    expect(withPointer.ox[0]).toBeCloseTo(without.ox[0], 6);
    expect(withPointer.oy[0]).toBeCloseTo(without.oy[0], 6);
  });

  it("is deterministic: identical step sequences produce identical states", () => {
    const a = freshState();
    const b = freshState();
    run(a, 3000, 0.7);
    run(b, 3000, 0.7);
    expect([...a.ox]).toEqual([...b.ox]);
    expect([...a.vy]).toEqual([...b.vy]);
  });
});

describe("hero/piecePhysics.ts homing (no reassembly jump)", () => {
  it("contracts offsets to ~0 by the time separation ends on a settle", () => {
    const s = freshState();
    const { bx, by } = basePositions();
    // Bump hard: cursor parked in the cluster at full shatter for 2s.
    for (let t = 0; t < 2000; t += 16.7) {
      stepPiecePhysics(s, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 1,
        pointerX: bx[0] - 8,
        pointerY: by[0],
      });
    }
    expect(maxOffsetMag(s)).toBeGreaterThan(1);
    // Settle tail: shatter eases 1 -> 0 like the real ease-out (slow tail),
    // ~2.5s total, sampled at 60fps.
    const steps = 150;
    for (let i = 1; i <= steps; i++) {
      const x = i / steps;
      const inv = 1 - x;
      const shatter = inv * inv * inv; // slow-ending decay like the settle tail
      stepPiecePhysics(s, PIECES, bx, by, {
        dtMs: 16.7,
        shatter,
        pointerX: null,
        pointerY: null,
      });
      if (shatter < 0.005) break;
    }
    // Just before separation fully ends, the float offset is already tiny.
    expect(maxOffsetMag(s)).toBeLessThan(1);
  });

  it("keeps the instant float on the way OUT (low shatter, rising)", () => {
    const s = freshState();
    const { bx, by } = basePositions();
    // Rise slowly through the same low shatter values homing uses.
    for (let i = 0; i < 30; i++) {
      stepPiecePhysics(s, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 0.02 + (i / 30) * 0.1,
        pointerX: null,
        pointerY: null,
      });
    }
    expect(maxOffsetMag(s)).toBeGreaterThan(0.2); // float alive, not homed away
  });
});

describe("hero/piecePhysics.ts field border (Revision 7b self-balancing)", () => {
  it("keeps every piece's position inside the field under a long full-shatter run", () => {
    const s = freshState();
    const { bx, by } = basePositions();
    for (let t = 0; t < 15000; t += 16.7) {
      stepPiecePhysics(s, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 1,
        pointerX: null,
        pointerY: null,
      });
    }
    for (let i = 0; i < PIECES.length; i++) {
      const posX = bx[i] + s.ox[i];
      const posY = by[i] + s.oy[i];
      expect(posX).toBeGreaterThan(-8);
      expect(posX).toBeLessThan(640 + 8);
      expect(posY).toBeGreaterThan(-8);
      expect(posY).toBeLessThan(240 + 8);
    }
  });

  it("pushes back a piece shoved into the border by the cursor, momentum intact", () => {
    const s = freshState();
    const { bx, by } = basePositions();
    // Find the right-most piece and shove it toward the right border.
    let target = 0;
    for (let i = 0; i < PIECES.length; i++) if (bx[i] > bx[target]) target = i;
    for (let t = 0; t < 3000; t += 16.7) {
      stepPiecePhysics(s, PIECES, bx, by, {
        dtMs: 16.7,
        shatter: 1,
        pointerX: bx[target] + s.ox[target] - 30, // always pushing it rightward
        pointerY: by[target] + s.oy[target],
      });
    }
    // Despite constant outward shoving, the border holds the piece in-field.
    expect(bx[target] + s.ox[target]).toBeLessThan(640 + 8);
  });
});
