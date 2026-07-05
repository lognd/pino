import { describe, it, expect } from "vitest";
import {
  initialScrubState,
  step,
  bandProgress,
  IDLE_THRESHOLD_MS,
  BLEND_MS,
  DEFAULT_SETTLE_MS,
  TOUCH_INTRO_MS,
  type ScrubMachineState,
} from "../../src/hero/scrubMachine";
import { SHOT_MOMENT } from "../../src/hero/timeline";

// docs/design/12-testing-strategy.md's frontend unit obligations: "scrub
// easing/idle state machine + shard purity (08)". Revision 2 rules encoded
// here: inner active band clamping, settle-home (both sides of SHOT_MOMENT),
// blend-back, and the touch one-shot. The old ping-pong drift test is gone --
// that behaviour was replaced and would now contradict settle-home.

const FRAME = 16; // ~60fps tick

/** Drive the machine for `ms` at a fixed frame time with a given pointer. */
function run(
  state: ScrubMachineState,
  ms: number,
  pointerX: number | null,
): ScrubMachineState {
  let s = state;
  for (let t = 0; t < ms; t += FRAME) {
    s = step(s, { pointerX, dtMs: FRAME });
  }
  return s;
}

describe("hero/scrubMachine.ts bandProgress (inner active band)", () => {
  it("clamps outside the band to 0/1 and is linear inside", () => {
    const inset = 0.2;
    // Left of the band -> 0.
    expect(bandProgress(0, inset)).toBe(0);
    expect(bandProgress(0.1, inset)).toBe(0);
    expect(bandProgress(inset, inset)).toBeCloseTo(0, 6);
    // Right of the band -> 1.
    expect(bandProgress(1, inset)).toBe(1);
    expect(bandProgress(0.9, inset)).toBe(1);
    expect(bandProgress(1 - inset, inset)).toBeCloseTo(1, 6);
    // Centre of the band -> 0.5, linear across it.
    expect(bandProgress(0.5, inset)).toBeCloseTo(0.5, 6);
  });

  it("respects a wider inset (band shrinks toward centre)", () => {
    expect(bandProgress(0.3, 0.3)).toBeCloseTo(0, 6);
    expect(bandProgress(0.7, 0.3)).toBeCloseTo(1, 6);
    expect(bandProgress(0.8, 0.3)).toBe(1); // beyond the band clamps hard
    expect(bandProgress(0.5, 0.3)).toBeCloseTo(0.5, 6);
  });
});

describe("hero/scrubMachine.ts step", () => {
  it("maps band edges to progress 0/1 through the active band", () => {
    const left = run(initialScrubState(), 800, 0);
    expect(left.progress).toBeLessThan(0.02);

    const right = run(initialScrubState(), 800, 1);
    expect(right.progress).toBeGreaterThan(0.98);
  });

  it("chases the target with eased, monotonic progress and no overshoot", () => {
    let s = initialScrubState();
    let prev = s.progress;
    for (let t = 0; t < 500; t += FRAME) {
      s = step(s, { pointerX: 1, dtMs: FRAME });
      expect(s.progress).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(s.progress).toBeLessThanOrEqual(1 + 1e-9);
      prev = s.progress;
    }
  });

  it("settles to within a few percent of target inside ~350ms", () => {
    const s = run(initialScrubState(), 350, 1);
    expect(s.progress).toBeGreaterThan(0.9);
  });

  it("micro-jitter near a point produces negligible visible movement", () => {
    // Park mid-band, then jitter a hair around it (all inside the band).
    let s = run(initialScrubState(), 600, 0.5);
    const parked = s.progress;
    for (let t = 0; t < 100; t += FRAME) {
      s = step(s, { pointerX: 0.5 + (t % 2 === 0 ? 0.001 : -0.001), dtMs: FRAME });
    }
    expect(Math.abs(s.progress - parked)).toBeLessThan(0.01);
  });

  it("settles HOME to 0 when idle below SHOT_MOMENT (reassembles)", () => {
    // pointerX 0.35 with default inset 0.2 -> progress ~0.25 (< SHOT_MOMENT).
    let s = run(initialScrubState(), 900, 0.35);
    expect(s.progress).toBeLessThan(SHOT_MOMENT);
    s = run(s, IDLE_THRESHOLD_MS + 100, null); // cross idle threshold -> settle
    expect(s.mode).toBe("settle");
    expect(s.settleTo).toBe(0);
    s = run(s, DEFAULT_SETTLE_MS + 600, null); // ease all the way home
    expect(s.progress).toBeLessThan(0.02);
  });

  it("settles HOME to 0 even when idle above SHOT_MOMENT (Revision 3: always reassembles)", () => {
    // pointerX 0.6 with default inset 0.2 -> progress ~0.67 (> SHOT_MOMENT).
    // The right extreme is the held-shattered state, so home is still 0.
    let s = run(initialScrubState(), 900, 0.6);
    expect(s.progress).toBeGreaterThan(SHOT_MOMENT);
    s = run(s, IDLE_THRESHOLD_MS + 100, null);
    expect(s.mode).toBe("settle");
    expect(s.settleTo).toBe(0);
    s = run(s, DEFAULT_SETTLE_MS + 600, null);
    expect(s.progress).toBeLessThan(0.02);
  });

  it("settles home (to 0) immediately when the pointer leaves the hero", () => {
    let s = run(initialScrubState(), 900, 0.6); // parked above SHOT
    s = step(s, { pointerX: null, dtMs: FRAME, pointerLeft: true });
    expect(s.mode).toBe("settle");
    expect(s.settleTo).toBe(0);
  });

  it("does NOT ping-pong: once reassembled it rests at 0", () => {
    let s = run(initialScrubState(), 900, 0.6); // above SHOT -> settles to 0
    s = run(s, IDLE_THRESHOLD_MS + DEFAULT_SETTLE_MS + 2000, null);
    // Long after arriving it stays put at 0 (no reversal, no drift back up).
    expect(s.mode).toBe("settle");
    expect(s.progress).toBeLessThan(0.02);
    const later = run(s, 3000, null);
    expect(Math.abs(later.progress - s.progress)).toBeLessThan(1e-3);
  });

  it("blends pointer control back in over ~500ms after settle-home", () => {
    let s = run(initialScrubState(), 300, 0.35); // park in band (progress ~0.25)
    s = run(s, IDLE_THRESHOLD_MS + 500, null); // settle home a while
    // Pointer returns to the far right of the band: enters blend, not a snap.
    s = step(s, { pointerX: 0.9, dtMs: FRAME });
    expect(s.mode).toBe("blend");
    const midway = step(s, { pointerX: 0.9, dtMs: FRAME });
    expect(midway.progress).toBeLessThan(1); // no instant snap
    const done = run(midway, BLEND_MS + 200, 0.9);
    expect(done.mode).toBe("pointer");
    expect(done.progress).toBeGreaterThan(0.95);
  });

  it("touch one-shot: plays 0 -> 1 then settles back to 0, ignoring the pointer", () => {
    let s = initialScrubState({ touch: true });
    expect(s.mode).toBe("touch");
    // Even with the pointer pinned left, touch mode ignores it and climbs.
    const mid = run(s, TOUCH_INTRO_MS / 2, 0);
    expect(mid.progress).toBeGreaterThan(0.2);
    expect(mid.progress).toBeLessThan(0.95);
    // Near the end of the intro it has reached full shatter.
    const peak = run(mid, TOUCH_INTRO_MS / 2, 0);
    expect(peak.progress).toBeGreaterThan(0.9);
    // Then (Revision 3) it reassembles all the way back to 0.
    s = run(peak, DEFAULT_SETTLE_MS + 800, 0);
    expect(s.mode).toBe("touch");
    expect(s.progress).toBeLessThan(0.03);
  });

  it("trips the low-power guard after two consecutive sub-30fps seconds", () => {
    let s = initialScrubState();
    for (let t = 0; t < 2500; t += 100) {
      s = step(s, { pointerX: 0.5, dtMs: 100 });
    }
    expect(s.fps).toBeLessThan(30);
    expect(s.belowThreshold).toBe(true);
  });

  it("does not trip the low-power guard at a healthy 60fps", () => {
    const s = run(initialScrubState(), 2500, 0.5);
    expect(s.belowThreshold).toBe(false);
  });
});
