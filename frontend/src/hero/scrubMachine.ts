// Pure scrub state machine -- docs/design/08-landing-hero.md (Revision 4).
//
// Extracted from useScrub.ts so the timing behaviour is testable without a DOM,
// a canvas, or a rAF loop. useScrub.ts is a thin rAF hook over `step`.
//
// REVISION 4 replaces the position-scrub model entirely. Progress is NO LONGER
// mapped to cursor X. The new model is ACTIVITY-DRIVEN:
//
//   * MOVEMENT ENERGY. Pointer movement feeds a smoothed energy accumulator
//     (EMA of instantaneous pointer speed). While there is energy the sequence
//     PLAYS FORWARD, its rate scaling with energy but CAPPED so vigorous
//     shaking cannot strobe it. Standing still: energy decays, progress holds.
//   * BREAK-ON-REACH. The instant the pointer/touch first enters the WORDMARK's
//     bounds (Hero feeds `wordmarkHit`), the shot fires: progress fast-eases
//     (not a hard cut) to just past SHOT_MOMENT so the lockup visibly starts
//     breaking the moment you touch it. Continued movement disintegrates it
//     further; stillness returns it whole.
//   * IDLE SETTLE-HOME. ~6s without movement (or the pointer leaving) -> ease
//     home to 0 over 4-6s; the wordmark reassembles. ALWAYS targets 0.
//   * TAKEOVER BLEND. Movement during a settle blends back to forward playback
//     over ~500ms (the advance rate ramps in) so control resumes without a snap.
//   * TOUCH. One slow forward pass on enter-viewport (0 -> 1), then settle back
//     to 0; touching the wordmark still triggers break-on-reach.
//
// The whole machine is a pure reducer: `step(state, input) -> newState`. No
// Date.now, no allocations, no side effects; everything is driven by `dtMs`,
// `moveAmount` (pointer distance this tick as a fraction of the hero diagonal),
// `wordmarkHit`, and `pointerLeft`. Determinism is what makes it unit-testable.

import { SHOT_MOMENT } from "./timeline";

/** EMA time constant for the movement-energy accumulator (ms). Short enough to
 * feel responsive, long enough that micro-jitter averages toward nothing. */
const ENERGY_TAU_MS = 160;

/** Below this smoothed energy the sequence is treated as "not playing" and
 * progress holds (no creep from sensor noise). Units: diagonals/second. */
const ENERGY_FLOOR = 0.04;

/** Energy (diagonals/second) -> forward progress rate (progress/second). */
const ENERGY_GAIN = 0.75;

/** Hard cap on forward playback rate (progress/second). Revision 4: vigorous
 * shaking must NOT strobe -- energy above the cap advances no faster than this
 * (full 0->1 sequence takes at least ~1.1s of continuous vigorous motion). */
export const ADVANCE_RATE_CAP = 0.9;

/** A per-tick move at or below this fraction of the hero diagonal counts as no
 * movement (idle-timer keeps running). */
const MOVE_EPS = 1e-4;

/** No movement for this long -> settle-home. Revision 4: 6s (the old 3s was
 * "a little short"). */
export const IDLE_THRESHOLD_MS = 6000;

/** Default settle-home duration (ms). Doc 08: 4-6s ease-out; 5s is the middle. */
export const DEFAULT_SETTLE_MS = 5000;

/** Touch one-shot: a single slow 0 -> 1 forward pass on load, then settle. */
export const TOUCH_INTRO_MS = 8000;

/** Takeover blend: movement after a settle ramps the advance rate in over this
 * long so control resumes without a snap. */
export const BLEND_MS = 500;

/** Break-on-reach fast-ease duration (ms): pointer entering the wordmark ramps
 * progress to just past SHOT_MOMENT this quickly. */
export const BREAK_MS = 280;

/** Where break-on-reach eases to: just past SHOT_MOMENT so the flash has fired
 * and the lockup is visibly coming apart. */
export const BREAK_TARGET = Math.min(1, SHOT_MOMENT + 0.06);

/** fps guard: below this for two consecutive 1s windows -> low power. */
const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_SECONDS_TO_TRIP = 2;

/** A single frame gap longer than this is a SUSPENSION (hidden tab, alt-tab,
 * frozen dev server), not slowness: rAF simply was not running. Such gaps
 * must not count toward the low-fps trip -- they latched the hero onto the
 * poster ("it sometimes breaks") on machines that render 60fps fine. The
 * fps window restarts fresh after the gap. */
export const SUSPEND_GAP_MS = 1000;

export type ScrubMode = "active" | "settle" | "breaking" | "touch";

export interface ScrubMachineState {
  /** Displayed progress in [0,1]; what the source + wordmark render. */
  progress: number;
  /** Smoothed movement energy (diagonals/second), drives forward playback. */
  energy: number;
  mode: ScrubMode;
  /** ms since the pointer last moved (drives the idle threshold). */
  idleMs: number;
  /** ms elapsed inside the current settle-home (mode === "settle"). */
  settleMs: number;
  /** progress captured when settle-home started (ease-out origin). */
  settleFrom: number;
  /** ms elapsed inside the current break-on-reach ramp (mode === "breaking"). */
  breakMs: number;
  /** progress captured when the break ramp started. */
  breakFrom: number;
  /** ms into the takeover blend after re-engaging from a settle (active only).
   * Clamped to BLEND_MS; at BLEND_MS the advance rate is fully engaged. */
  blendMs: number;
  /** ms elapsed inside the touch one-shot intro (mode === "touch"). */
  touchMs: number;
  // --- tunables (carried on state so /hero-lab can drive them) ---
  settleDurationMs: number;
  // --- fps guard accumulators (windowed, one-second buckets) ---
  fpsWindowMs: number;
  fpsWindowFrames: number;
  lowFpsSeconds: number;
  fps: number;
  belowThreshold: boolean;
}

export interface ScrubInput {
  /** Elapsed real milliseconds since the previous tick. */
  dtMs: number;
  /** Pointer distance moved this tick as a fraction of the hero diagonal
   * (>= 0). Omit / 0 means no movement this tick (feeds the idle timer). */
  moveAmount?: number;
  /** True on the tick the pointer/touch first entered the wordmark bounds. */
  wordmarkHit?: boolean;
  /** True on the tick the pointer left the hero (forces settle-home). */
  pointerLeft?: boolean;
}

export interface ScrubMachineConfig {
  /** Settle-home duration in ms. */
  settleMs: number;
  /** Start in the touch one-shot intro instead of pointer control. */
  touch: boolean;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** smoothstep, used to ease the takeover blend and the touch intro. */
function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** ease-out cubic: fast start, gentle stop -- the settle-home / break feel. */
function easeOutCubic(t: number): number {
  const x = clamp01(t);
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

/** Fresh machine state parked at sequence start. Active (energy-driven) unless
 * `touch` is set, in which case it begins the one-shot forward pass. */
export function initialScrubState(
  config: Partial<ScrubMachineConfig> = {},
): ScrubMachineState {
  const settleDurationMs = config.settleMs ?? DEFAULT_SETTLE_MS;
  const touch = config.touch ?? false;
  return {
    progress: 0,
    energy: 0,
    mode: touch ? "touch" : "active",
    idleMs: 0,
    settleMs: 0,
    settleFrom: 0,
    breakMs: 0,
    breakFrom: 0,
    blendMs: BLEND_MS, // start fully engaged (no artificial ramp on first move).
    touchMs: 0,
    settleDurationMs,
    fpsWindowMs: 0,
    fpsWindowFrames: 0,
    lowFpsSeconds: 0,
    fps: 0,
    belowThreshold: false,
  };
}

/** Begin easing home. Revision 4: home is ALWAYS 0 -- the lockup reassembles on
 * every inaction (the right extreme is the held-shattered state). */
function enterSettle(next: ScrubMachineState, fromProgress: number): void {
  next.mode = "settle";
  next.settleMs = 0;
  next.settleFrom = fromProgress;
}

/** Begin the break-on-reach fast ramp toward BREAK_TARGET. */
function enterBreaking(next: ScrubMachineState, fromProgress: number): void {
  next.mode = "breaking";
  next.breakMs = 0;
  next.breakFrom = fromProgress;
}

/** Advance the machine one tick. Pure: same (state, input) -> same state. */
export function step(state: ScrubMachineState, input: ScrubInput): ScrubMachineState {
  const dt = input.dtMs > 0 ? input.dtMs : 0;
  const next: ScrubMachineState = { ...state };

  // --- fps windowing (independent of scrub mode) ---
  if (dt > SUSPEND_GAP_MS) {
    // Suspension gap: discard the window; measure fresh from the next tick.
    next.fpsWindowMs = 0;
    next.fpsWindowFrames = 0;
  } else {
    next.fpsWindowMs = state.fpsWindowMs + dt;
    next.fpsWindowFrames = state.fpsWindowFrames + 1;
    if (next.fpsWindowMs >= 1000) {
      next.fps = (next.fpsWindowFrames * 1000) / next.fpsWindowMs;
      next.lowFpsSeconds = next.fps < LOW_FPS_THRESHOLD ? state.lowFpsSeconds + 1 : 0;
      if (next.lowFpsSeconds >= LOW_FPS_SECONDS_TO_TRIP) next.belowThreshold = true;
      next.fpsWindowMs = 0;
      next.fpsWindowFrames = 0;
    }
  }

  // --- movement energy: EMA of instantaneous pointer speed (diagonals/sec) ---
  const moveAmount = input.moveAmount && input.moveAmount > 0 ? input.moveAmount : 0;
  const moved = moveAmount > MOVE_EPS;
  const instSpeed = dt > 0 ? (moveAmount / dt) * 1000 : 0;
  const eAlpha = dt > 0 ? 1 - Math.exp(-dt / ENERGY_TAU_MS) : 0;
  next.energy = state.energy + (instSpeed - state.energy) * eAlpha;
  next.idleMs = moved ? 0 : state.idleMs + dt;

  // --- break-on-reach: reaching the wordmark fires the shot (highest priority,
  // works from any mode as long as we're still short of the broken state) ---
  if (input.wordmarkHit && state.mode !== "breaking" && state.progress < BREAK_TARGET) {
    enterBreaking(next, state.progress);
  }

  // --- touch one-shot: ignore energy, ramp 0 -> 1 once, then settle to 0.
  // (Break-on-reach above can still pre-empt it into the breaking ramp.) ---
  if (next.mode === "touch") {
    next.touchMs = state.touchMs + dt;
    if (next.touchMs <= TOUCH_INTRO_MS) {
      next.progress = smoothstep(clamp01(next.touchMs / TOUCH_INTRO_MS)); // 0 -> 1
    } else {
      const k = easeOutCubic((next.touchMs - TOUCH_INTRO_MS) / state.settleDurationMs);
      next.progress = clamp01(1 - k);
    }
    return next;
  }

  // --- break-on-reach ramp: fast ease to just past SHOT_MOMENT, then hand to
  // active so continued movement keeps disintegrating the lockup ---
  if (next.mode === "breaking") {
    next.breakMs = (state.mode === "breaking" ? state.breakMs : 0) + dt;
    const k = easeOutCubic(next.breakMs / BREAK_MS);
    next.progress = clamp01(next.breakFrom + (BREAK_TARGET - next.breakFrom) * k);
    if (next.breakMs >= BREAK_MS) {
      next.mode = "active";
      next.blendMs = BLEND_MS; // already engaged; no extra ramp after a break.
      next.idleMs = 0;
    }
    return next;
  }

  // --- settle-home: ease progress -> 0; movement re-engages active w/ blend ---
  if (next.mode === "settle") {
    if (moved) {
      next.mode = "active";
      next.blendMs = 0; // ramp the advance rate back in over BLEND_MS (no snap).
      next.idleMs = 0;
    } else {
      next.settleMs = (state.mode === "settle" ? state.settleMs : 0) + dt;
      const k = easeOutCubic(next.settleMs / state.settleDurationMs);
      next.progress = clamp01(next.settleFrom * (1 - k));
      return next;
    }
  }

  // --- active (energy-driven forward playback) ---
  // Idle or pointer-leave -> settle-home (always to 0).
  if ((next.idleMs >= IDLE_THRESHOLD_MS || input.pointerLeft === true) && !moved) {
    enterSettle(next, state.progress);
    // Run the first settle tick immediately so a pointer-leave visibly drifts.
    next.settleMs = dt;
    const k = easeOutCubic(next.settleMs / state.settleDurationMs);
    next.progress = clamp01(next.settleFrom * (1 - k));
    return next;
  }

  next.blendMs = Math.min(BLEND_MS, (state.mode === "active" ? state.blendMs : 0) + dt);
  const blendK = smoothstep(next.blendMs / BLEND_MS);
  const activeEnergy = next.energy > ENERGY_FLOOR ? next.energy : 0;
  const rate = Math.min(ADVANCE_RATE_CAP, activeEnergy * ENERGY_GAIN);
  next.progress = clamp01(state.progress + rate * blendK * (dt / 1000));
  return next;
}
