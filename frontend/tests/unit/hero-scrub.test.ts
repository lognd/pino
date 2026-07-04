import { describe, it, expect } from "vitest";
import {
  initialScrubState,
  step,
  IDLE_THRESHOLD_MS,
  BLEND_MS,
  type ScrubMachineState,
} from "../../src/hero/scrubMachine";

// docs/design/12-testing-strategy.md's frontend unit obligations: "scrub
// easing/idle state machine + shard purity (08)".

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

describe("hero/scrubMachine.ts", () => {
  it("maps cursor position at the left/right edges to progress 0/1", () => {
    const left = run(initialScrubState(), 800, 0);
    expect(left.progress).toBeLessThan(0.02);

    const right = run(initialScrubState(), 800, 1);
    expect(right.progress).toBeGreaterThan(0.98);
  });

  it("chases the target with eased, monotonic progress and no overshoot", () => {
    let s = initialScrubState();
    let prev = s.progress;
    let ticks = 0;
    // Hold pointer hard right; progress must rise monotonically toward 1
    // and never exceed the target (no overshoot).
    for (let t = 0; t < 500; t += FRAME) {
      s = step(s, { pointerX: 1, dtMs: FRAME });
      expect(s.progress).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(s.progress).toBeLessThanOrEqual(1 + 1e-9);
      prev = s.progress;
      ticks++;
    }
    expect(ticks).toBeGreaterThan(0);
  });

  it("settles to within a few percent of target inside ~350ms", () => {
    const s = run(initialScrubState(), 350, 1);
    expect(s.progress).toBeGreaterThan(0.9);
  });

  it("micro-jitter near a point produces negligible visible movement", () => {
    // Park near the middle, then jitter a hair around it.
    let s = run(initialScrubState(), 600, 0.5);
    const parked = s.progress;
    for (let t = 0; t < 100; t += FRAME) {
      s = step(s, { pointerX: 0.5 + (t % 2 === 0 ? 0.001 : -0.001), dtMs: FRAME });
    }
    expect(Math.abs(s.progress - parked)).toBeLessThan(0.01);
  });

  it("drifts forward at ~1/20 speed after 3s idle", () => {
    // Establish pointer control at start, then go idle (pointerX null).
    let s = run(initialScrubState(), 200, 0);
    s = run(s, IDLE_THRESHOLD_MS + 200, null); // cross the idle threshold
    expect(s.mode).toBe("drift");
    const before = s.progress;
    s = run(s, 1000, null); // 1s of drift ~= 1/20 progress
    const delta = s.progress - before;
    expect(delta).toBeGreaterThan(0.02);
    expect(delta).toBeLessThan(0.09);
  });

  it("ping-pongs: reverses direction after reaching the end while idle", () => {
    let s = run(initialScrubState(), 200, 1); // park near the end
    s = run(s, IDLE_THRESHOLD_MS + 100, null); // go idle -> drift forward
    s = run(s, 3000, null); // hit the end and bounce back
    expect(s.driftDir).toBe(-1);
    expect(s.progress).toBeLessThan(1);
  });

  it("blends pointer control back in over ~500ms after idle drift", () => {
    let s = run(initialScrubState(), 200, 0);
    s = run(s, IDLE_THRESHOLD_MS + 500, null); // drift forward a while
    // Pointer returns to the far right: enters blend, not a snap.
    s = step(s, { pointerX: 1, dtMs: FRAME });
    expect(s.mode).toBe("blend");
    const midway = step(s, { pointerX: 1, dtMs: FRAME });
    expect(midway.progress).toBeLessThan(1); // no instant snap to 1
    // After the full blend window it is pointer-controlled again.
    const done = run(midway, BLEND_MS + 200, 1);
    expect(done.mode).toBe("pointer");
    expect(done.progress).toBeGreaterThan(0.95);
  });

  it("trips the low-power guard after two consecutive sub-30fps seconds", () => {
    let s = initialScrubState();
    // ~10fps => 100ms frames. Two seconds of that must latch belowThreshold.
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
