import { describe, it, expect } from "vitest";
import {
  initialScrubState,
  step,
  IDLE_THRESHOLD_MS,
  DEFAULT_SETTLE_MS,
  TOUCH_INTRO_MS,
  BREAK_TARGET,
  ADVANCE_RATE_CAP,
  timeFlowScale,
  BREAK_MS,
  type ScrubMachineState,
  type ScrubInput,
} from "../../src/hero/scrubMachine";
import { SHOT_MOMENT } from "../../src/hero/timeline";

// docs/design/08-landing-hero.md (Revision 4): the position-scrub model is
// GONE. Progress is now ACTIVITY-DRIVEN -- movement energy advances playback
// (capped, no strobe), reaching the wordmark fires the shot (break-on-reach),
// ~6s of stillness settles home to 0, and touch plays one pass then settles.

const FRAME = 16; // ~60fps tick

/** Drive the machine for `ms` at a fixed frame time with a fixed input. */
function run(state: ScrubMachineState, ms: number, input: Omit<ScrubInput, "dtMs">): ScrubMachineState {
  let s = state;
  for (let t = 0; t < ms; t += FRAME) {
    s = step(s, { ...input, dtMs: FRAME });
  }
  return s;
}

describe("hero/scrubMachine.ts energy-driven playback", () => {
  it("advances progress forward while the pointer is moving", () => {
    // 0.02 diagonals/tick -> comfortably above the energy floor.
    const s = run(initialScrubState(), 600, { moveAmount: 0.02 });
    expect(s.progress).toBeGreaterThan(0.2);
    expect(s.energy).toBeGreaterThan(0);
  });

  it("advances monotonically (no reverse under continued movement)", () => {
    let s = initialScrubState();
    let prev = s.progress;
    for (let t = 0; t < 800; t += FRAME) {
      s = step(s, { moveAmount: 0.015, dtMs: FRAME });
      expect(s.progress).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s.progress;
    }
  });

  it("coasts to a stop and then holds when movement stops (before idle)", () => {
    let s = run(initialScrubState(), 500, { moveAmount: 0.02 });
    s = run(s, 500, { moveAmount: 0 }); // energy decays -> playback coasts to rest
    const parked = s.progress;
    s = run(s, 2000, { moveAmount: 0 }); // still, but well under 6s idle
    expect(s.mode).toBe("active");
    expect(Math.abs(s.progress - parked)).toBeLessThan(0.005); // fully at rest
  });

  it("CAPS the advance rate so vigorous shaking cannot strobe", () => {
    // A huge per-tick move would, uncapped, blow progress to 1 almost at once.
    const s = run(initialScrubState(), 1000, { moveAmount: 0.5 });
    // Over 1s the cap allows at most ~ADVANCE_RATE_CAP of progress.
    expect(s.progress).toBeLessThanOrEqual(ADVANCE_RATE_CAP + 0.03);
    // And doubling the movement does not advance meaningfully faster.
    const s2 = run(initialScrubState(), 1000, { moveAmount: 1.0 });
    expect(Math.abs(s2.progress - s.progress)).toBeLessThan(0.03);
  });

  it("micro-jitter produces negligible movement", () => {
    // Tiny sub-floor movements each tick -> energy stays below the floor.
    let s = initialScrubState();
    for (let t = 0; t < 1000; t += FRAME) {
      s = step(s, { moveAmount: 1e-5, dtMs: FRAME });
    }
    expect(s.progress).toBeLessThan(0.01);
  });
});

describe("hero/scrubMachine.ts break-on-reach", () => {
  it("fast-eases past SHOT_MOMENT the instant the pointer reaches the wordmark", () => {
    let s = initialScrubState();
    s = step(s, { dtMs: FRAME, wordmarkHit: true });
    expect(s.mode).toBe("breaking");
    s = run(s, BREAK_MS + 100, {}); // complete the fast ease
    expect(s.progress).toBeGreaterThan(SHOT_MOMENT);
    expect(s.progress).toBeCloseTo(BREAK_TARGET, 2);
    expect(s.mode).toBe("active"); // hands back to active playback
  });

  it("does not re-fire the break once already past the target", () => {
    let s = run(initialScrubState(), 1000, { moveAmount: 0.5 }); // already broken
    const before = s.progress;
    s = step(s, { dtMs: FRAME, wordmarkHit: true });
    expect(s.mode).not.toBe("breaking");
    expect(s.progress).toBeGreaterThanOrEqual(before - 1e-6);
  });
});

describe("hero/scrubMachine.ts idle settle-home", () => {
  it("settles HOME to 0 after ~6s of stillness (reassembles)", () => {
    let s = run(initialScrubState(), 800, { moveAmount: 0.05 }); // break it open
    expect(s.progress).toBeGreaterThan(SHOT_MOMENT);
    s = run(s, IDLE_THRESHOLD_MS + FRAME, { moveAmount: 0 }); // cross idle
    expect(s.mode).toBe("settle");
    s = run(s, DEFAULT_SETTLE_MS + 600, { moveAmount: 0 }); // ease all the way
    expect(s.progress).toBeLessThan(0.02);
  });

  it("settles home immediately when the pointer leaves the hero", () => {
    let s = run(initialScrubState(), 800, { moveAmount: 0.05 });
    s = step(s, { dtMs: FRAME, pointerLeft: true });
    expect(s.mode).toBe("settle");
    s = run(s, DEFAULT_SETTLE_MS + 600, { moveAmount: 0 });
    expect(s.progress).toBeLessThan(0.02);
  });

  it("does not ping-pong: once reassembled it rests at 0", () => {
    let s = run(initialScrubState(), 800, { moveAmount: 0.05 });
    s = run(s, IDLE_THRESHOLD_MS + DEFAULT_SETTLE_MS + 2000, { moveAmount: 0 });
    expect(s.progress).toBeLessThan(0.02);
    const later = run(s, 3000, { moveAmount: 0 });
    expect(Math.abs(later.progress - s.progress)).toBeLessThan(1e-3);
  });

  it("blends back to playback (no snap) when movement resumes during a settle", () => {
    let s = run(initialScrubState(), 800, { moveAmount: 0.05 });
    s = run(s, IDLE_THRESHOLD_MS + 1500, { moveAmount: 0 }); // settling home
    expect(s.mode).toBe("settle");
    const settling = s.progress;
    // Movement resumes: re-engage active, ramping in (does not jump).
    s = step(s, { dtMs: FRAME, moveAmount: 0.03 });
    expect(s.mode).toBe("active");
    expect(Math.abs(s.progress - settling)).toBeLessThan(0.02); // no snap
  });
});

describe("hero/scrubMachine.ts touch idle + one-shot on interaction", () => {
  it("rests at 0 in idle mode until the first interaction, ignoring pointer energy", () => {
    let s = initialScrubState({ touch: true });
    expect(s.mode).toBe("idle");
    s = run(s, 2000, { moveAmount: 0.05 }); // movement alone must not start it
    expect(s.mode).toBe("idle");
    expect(s.progress).toBe(0);
  });

  it("starts the one-shot pass on interactionStart, plays 0 -> 1, then settles back to 0", () => {
    let s = initialScrubState({ touch: true });
    s = step(s, { dtMs: FRAME, interactionStart: true });
    expect(s.mode).toBe("touch");
    const mid = run(s, TOUCH_INTRO_MS / 2, { moveAmount: 0 });
    expect(mid.progress).toBeGreaterThan(0.2);
    expect(mid.progress).toBeLessThan(0.95);
    const peak = run(mid, TOUCH_INTRO_MS / 2, { moveAmount: 0 });
    expect(peak.progress).toBeGreaterThan(0.9);
    s = run(peak, DEFAULT_SETTLE_MS + 800, { moveAmount: 0 });
    expect(s.progress).toBeLessThan(0.03);
  });

  it("touching the wordmark while idle triggers break-on-reach directly", () => {
    let s = initialScrubState({ touch: true });
    s = step(s, { dtMs: FRAME, wordmarkHit: true });
    expect(s.mode).toBe("breaking");
  });

  it("touching the wordmark during the touch pass also triggers break-on-reach", () => {
    let s = initialScrubState({ touch: true });
    s = step(s, { dtMs: FRAME, interactionStart: true });
    expect(s.mode).toBe("touch");
    s = step(s, { dtMs: FRAME, wordmarkHit: true });
    expect(s.mode).toBe("breaking");
  });
});

describe("hero/scrubMachine.ts fps guard", () => {
  it("trips after two consecutive sub-30fps seconds", () => {
    let s = initialScrubState();
    for (let t = 0; t < 2500; t += 100) {
      s = step(s, { moveAmount: 0.01, dtMs: 100 });
    }
    expect(s.fps).toBeLessThan(30);
    expect(s.belowThreshold).toBe(true);
  });

  it("does not trip at a healthy 60fps", () => {
    const s = run(initialScrubState(), 2500, { moveAmount: 0.01 });
    expect(s.belowThreshold).toBe(false);
  });
});

// Regression for "it sometimes breaks": a hidden/suspended tab pauses rAF, so
// the first tick after resume carries a giant dtMs. The old fps windowing
// counted that as a sub-30fps second; two of them latched belowThreshold and
// the hero silently dropped to the poster forever on machines that render
// 60fps fine. Suspension gaps must be discarded, not counted.

describe("hero/scrubMachine.ts fps guard suspension hygiene", () => {
  it("does not count tab-suspension gaps toward the low-fps trip", () => {
    let s = initialScrubState();
    // Healthy runs interleaved with long suspensions (alt-tab, dev restart).
    for (let cycle = 0; cycle < 4; cycle++) {
      s = run(s, 1500, {}); // 1.5s healthy 60fps
      s = step(s, { dtMs: 30000 }); // 30s suspension gap in a single tick
    }
    expect(s.belowThreshold).toBe(false);
  });

  it("still trips on genuinely sustained low fps after a suspension", () => {
    let s = initialScrubState();
    s = step(s, { dtMs: 30000 }); // suspension, discarded
    for (let t = 0; t < 2500; t += 50) s = step(s, { dtMs: 50 }); // 20fps
    expect(s.belowThreshold).toBe(true);
  });
});

describe("hero/scrubMachine.ts SUPERHOT time flow (Revision 7)", () => {
  it("flows at full rate while moving vigorously", () => {
    const s = run(initialScrubState(), 800, { moveAmount: 0.02 });
    expect(timeFlowScale(s)).toBe(1);
  });

  it("freezes HARD (exactly 0) shortly after movement stops", () => {
    let s = run(initialScrubState(), 800, { moveAmount: 0.02 });
    s = run(s, 1200, {}); // still; energy EMA decays
    expect(s.mode).toBe("active"); // not yet idle-settling
    expect(timeFlowScale(s)).toBe(0);
  });

  it("runs at full time during the settle so the rejoin animates", () => {
    let s = run(initialScrubState(), 800, { moveAmount: 0.02 });
    s = run(s, IDLE_THRESHOLD_MS + 200, {});
    expect(s.mode).toBe("settle");
    expect(timeFlowScale(s)).toBe(1);
  });
});
