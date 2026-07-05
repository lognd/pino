import { describe, it, expect } from "vitest";
import {
  flashEnvelope,
  clampLuminanceStep,
  FlashGuard,
  FLASH_MIN_TRANSITION_MS,
  FLASH_REARM_PROGRESS,
  SHOT_MOMENT,
} from "../../src/hero/timeline";
import {
  sceneParams,
  FLASH_VARIANTS,
  type SceneParams,
  type FlashVariant,
} from "../../src/hero/sources/simulated";

// docs/design/08-landing-hero.md (Revision 4): the flash is light-on-the-scene,
// guarded against photosensitivity, and the scene is CONTINUOUS in progress
// (the mid-sequence "crash" was killed). These pin the clamp math and the
// field-continuity regression the doc requires.

describe("hero/timeline.ts flashEnvelope (shared single beat)", () => {
  it("peaks at SHOT_MOMENT and decays to ~0 away from it", () => {
    expect(flashEnvelope(SHOT_MOMENT)).toBeCloseTo(1, 6);
    expect(flashEnvelope(0)).toBeLessThan(0.001);
    expect(flashEnvelope(1)).toBeLessThan(0.001);
  });

  it("is continuous: no field step exceeds a small bound", () => {
    let prev = flashEnvelope(0);
    for (let p = 0.005; p <= 1.00001; p += 0.005) {
      const v = flashEnvelope(p);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});

describe("hero/timeline.ts clampLuminanceStep (WCAG 2.3.1 rate clamp)", () => {
  it("moves at most one full 0->1 swing per FLASH_MIN_TRANSITION_MS", () => {
    // A full-range target in a single small tick is rate-limited.
    const stepped = clampLuminanceStep(0, 1, 16);
    expect(stepped).toBeCloseTo(16 / FLASH_MIN_TRANSITION_MS, 6);
    expect(stepped).toBeLessThan(1);
  });

  it("reaches the target exactly once enough wall-clock time has passed", () => {
    // With >= 150ms the full swing is allowed.
    expect(clampLuminanceStep(0, 1, FLASH_MIN_TRANSITION_MS)).toBeCloseTo(1, 6);
    expect(clampLuminanceStep(0, 0.5, FLASH_MIN_TRANSITION_MS)).toBeCloseTo(0.5, 6);
  });

  it("clamps downward transitions symmetrically", () => {
    expect(clampLuminanceStep(1, 0, 15)).toBeCloseTo(1 - 15 / FLASH_MIN_TRANSITION_MS, 6);
  });

  it("never moves when no wall-clock time elapses (dt <= 0)", () => {
    expect(clampLuminanceStep(0.3, 1, 0)).toBe(0.3);
    expect(clampLuminanceStep(0.3, 1, -50)).toBe(0.3);
  });

  it("no fast scrub can strobe: 60 rapid full-range flips stay bounded per step", () => {
    let lum = 0;
    for (let i = 0; i < 60; i++) {
      const target = i % 2 === 0 ? 1 : 0;
      const nextLum = clampLuminanceStep(lum, target, 16); // 60fps ticks
      expect(Math.abs(nextLum - lum)).toBeLessThanOrEqual(16 / FLASH_MIN_TRANSITION_MS + 1e-9);
      lum = nextLum;
    }
  });
});

describe("hero/sources/simulated.ts sceneParams (field continuity regression)", () => {
  const FIELDS: (keyof SceneParams)[] = [
    "exposure",
    "bloom",
    "bloomRadius",
    "rim",
    "smokeGlow",
    "smokeTravel",
    "smokeAmount",
  ];

  for (const variant of FLASH_VARIANTS) {
    it(`variant "${variant}" has no field discontinuity across progress`, () => {
      let prev = sceneParams(0, variant);
      // Sample densely in BOTH directions (scrub forward and back): a pure
      // continuous scene means every field steps by a small bound per 0.004.
      for (let p = 0.004; p <= 1.00001; p += 0.004) {
        const cur = sceneParams(p, variant);
        for (const f of FIELDS) {
          const step = Math.abs(cur[f] - prev[f]);
          expect(step, `${variant}.${String(f)} step near p=${p.toFixed(3)}`).toBeLessThan(0.08);
        }
        prev = cur;
      }
    });
  }

  it("has zero exposure/bloom at rest (p=0) for every variant", () => {
    for (const variant of FLASH_VARIANTS as FlashVariant[]) {
      const s = sceneParams(0, variant);
      expect(s.exposure).toBeLessThan(0.001);
      expect(s.bloom).toBeLessThan(0.001);
    }
  });

  it("peaks the exposure beat right around SHOT_MOMENT", () => {
    const at = sceneParams(SHOT_MOMENT, "exposure").exposure;
    const before = sceneParams(SHOT_MOMENT - 0.15, "exposure").exposure;
    const after = sceneParams(SHOT_MOMENT + 0.15, "exposure").exposure;
    expect(at).toBeGreaterThan(before);
    expect(at).toBeGreaterThan(after);
  });
});

// Regression for the "black flash" bug: the old guard latched "already
// flashed" the instant displayed luminance crossed 0.25 mid-rise, then zeroed
// its own target -- the flash suppressed itself before ever peaking, so the
// shot rendered a pure black frame at SHOT_MOMENT. FlashGuard must let the
// FIRST traversal of the beat display in full, then block re-entry strobing.

/** Drive the guard through a slow forward sweep at 60fps; return the peak
 * displayed luminance and the guard (for further stepping). */
function sweepForward(guard: FlashGuard, from: number, to: number, steps: number) {
  let peak = 0;
  for (let i = 0; i <= steps; i++) {
    const p = from + ((to - from) * i) / steps;
    const target = Math.max(
      sceneParams(p, "exposure").exposure,
      sceneParams(p, "exposure").bloom * 0.7,
    );
    peak = Math.max(peak, guard.step(target, p, 16.7));
  }
  return peak;
}

describe("hero/timeline.ts FlashGuard (one full flash per cycle)", () => {
  it("displays the first beat at (near) full amplitude -- no self-suppression", () => {
    const guard = new FlashGuard();
    const rawPeak = Math.max(
      sceneParams(SHOT_MOMENT, "exposure").exposure,
      sceneParams(SHOT_MOMENT, "exposure").bloom * 0.7,
    );
    // ~3s sweep 0 -> 0.4: slow enough that the rate clamp never binds.
    const peak = sweepForward(guard, 0, 0.4, 180);
    expect(peak).toBeGreaterThan(rawPeak * 0.95);
  });

  it("suppresses a second rise when progress oscillates around the beat", () => {
    const guard = new FlashGuard();
    sweepForward(guard, 0, 0.45, 180); // full first traversal, flash spent.
    // Oscillate back and forth across the beat WITHOUT going home.
    let second = 0;
    for (let i = 0; i < 240; i++) {
      const p = 0.3 + 0.15 * Math.sin(i / 8); // 0.15 .. 0.45, through the beat.
      const target = Math.max(
        sceneParams(p, "exposure").exposure,
        sceneParams(p, "exposure").bloom * 0.7,
      );
      second = Math.max(second, guard.step(target, p, 16.7));
    }
    expect(second).toBeLessThan(0.06);
  });

  it("re-arms once progress returns home below FLASH_REARM_PROGRESS", () => {
    const guard = new FlashGuard();
    sweepForward(guard, 0, 0.45, 180); // spend the flash.
    sweepForward(guard, 0.45, 0, 180); // settle home (re-arms below the mark).
    expect(FLASH_REARM_PROGRESS).toBeLessThan(SHOT_MOMENT);
    const peak = sweepForward(guard, 0, 0.4, 180); // second engagement.
    expect(peak).toBeGreaterThan(0.5);
  });

  it("never exceeds the wall-clock rate clamp, even under a hard progress cut", () => {
    const guard = new FlashGuard();
    let prev = guard.step(0, 0, 16.7);
    // Teleport straight to the beat: displayed rise is still rate-clamped.
    for (let i = 0; i < 30; i++) {
      const lum = guard.step(1, SHOT_MOMENT, 16.7);
      expect(Math.abs(lum - prev)).toBeLessThanOrEqual(16.7 / FLASH_MIN_TRANSITION_MS + 1e-9);
      prev = lum;
    }
  });

  it("lets a flash frozen mid-beat die out in wall-clock time (no stuck wash)", () => {
    const guard = new FlashGuard();
    // Rise to the peak, then hold progress exactly at the beat.
    for (let i = 0; i < 60; i++) guard.step(1, SHOT_MOMENT, 16.7);
    let lum = 1;
    for (let i = 0; i < 120; i++) lum = guard.step(1, SHOT_MOMENT, 16.7); // ~2s hold.
    expect(lum).toBeLessThan(0.06);
  });
});
