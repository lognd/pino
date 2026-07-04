// Pure scrub state machine -- docs/design/08-landing-hero.md (Revision 2).
//
// Extracted from useScrub.ts so the timing behaviour (eased chase, idle
// settle-home drift, blend-back, touch one-shot, low-fps guard) is testable
// without a DOM, a canvas, or a rAF loop. useScrub.ts is a thin rAF hook over
// `step`.
//
// The whole machine is a pure reducer: `step(state, input) -> newState`.
// No `Date.now`, no allocations of arrays, no side effects. Everything is
// driven by `dtMs` (elapsed real time this tick), `pointerX` (the latest raw
// [0,1] pointer position across the hero, or null when the pointer has not
// moved this tick), and `pointerLeft` (the pointer left the hero this tick).
// Determinism here is what makes the settle-home and blend-back behaviours
// unit-testable.
//
// REVISION 2 changes vs the first implementation:
//   - Cursor maps across an INNER ACTIVE BAND, not edge-to-edge. `bandInset`
//     (fraction per side, >= 0.15) is carried on the state so /hero-lab can
//     tune it; `bandProgress` clamps outside the band to 0/1.
//   - The idle behaviour is SETTLE-HOME, not ping-pong: after 3s idle or a
//     pointer-leave the sequence eases (ease-out, ~5s) to the nearest
//     assembled extreme (0 if progress < SHOT_MOMENT else 1) and RESTS whole.
//     Ambient life at rest comes from the source's grain/smoke, not progress.
//   - Touch devices get ONE slow settle-through on load (0 -> 1 over ~8s),
//     then rest -- pointer input is ignored entirely in that mode.

import { SHOT_MOMENT } from "./timeline";

/** Exponential-smoothing time constant for the eased chase (ms). progress
 * reaches ~94% of a step in ~2.8*TAU; with TAU=90ms that is ~250ms, the
 * midpoint of doc 08's "200-350ms settle" critically-damped feel. */
const CHASE_TAU_MS = 90;

/** No pointer movement for this long flips the machine into settle-home. */
export const IDLE_THRESHOLD_MS = 3000;

/** Default settle-home duration (ms). Doc 08 asks for 4-6s ease-out; 5s is
 * the middle. Surfaced as a tunable in /hero-lab via `initialScrubState`. */
export const DEFAULT_SETTLE_MS = 5000;

/** Touch one-shot: a single slow 0 -> 1 settle-through on load, then rest. */
export const TOUCH_INTRO_MS = 8000;

/** Inner active band inset per side, as a fraction of hero width. Doc 08:
 * "inset at least 15% from each side". Default is comfortably inside that so
 * scrubbing never engages hard against the hero edges; tune in /hero-lab. */
export const DEFAULT_BAND_INSET = 0.2;

/** Blend from settle/drift back to pointer control takes ~500ms, no snap. */
export const BLEND_MS = 500;

/** fps guard: below this for two consecutive 1s windows -> low power. */
const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_SECONDS_TO_TRIP = 2;

export type ScrubMode = "pointer" | "settle" | "blend" | "touch";

export interface ScrubMachineState {
  /** Displayed progress in [0,1]; what the source + wordmark render. */
  progress: number;
  /** Where `progress` is easing toward this tick. */
  target: number;
  /** Latest pointer-derived target (sticky between pointer moves). */
  pointerTarget: number;
  mode: ScrubMode;
  /** ms since the pointer last moved (drives the 3s idle threshold). */
  idleMs: number;
  /** ms elapsed inside the current blend-back (mode === "blend"). */
  blendMs: number;
  /** progress captured when a blend-back started (blend lerp origin). */
  blendFrom: number;
  /** ms elapsed inside the current settle-home (mode === "settle"). */
  settleMs: number;
  /** progress captured when settle-home started (ease-out origin). */
  settleFrom: number;
  /** The assembled extreme settle-home eases toward (0 or 1). */
  settleTo: number;
  /** ms elapsed inside the touch one-shot intro (mode === "touch"). */
  touchMs: number;
  // --- tunables (carried on state so /hero-lab can drive them) ---
  /** Active-band inset per side, fraction of hero width. */
  bandInset: number;
  /** Settle-home duration in ms. */
  settleDurationMs: number;
  // --- fps guard accumulators (windowed, one-second buckets) ---
  fpsWindowMs: number;
  fpsWindowFrames: number;
  /** Consecutive completed 1s windows that averaged < 30fps. */
  lowFpsSeconds: number;
  /** Most recent completed window's fps estimate (0 until first window). */
  fps: number;
  /** True once two consecutive seconds averaged < 30fps (latches). */
  belowThreshold: boolean;
}

export interface ScrubInput {
  /** Latest raw pointer x in [0,1] across the hero, or null if unmoved. */
  pointerX: number | null;
  /** Elapsed real milliseconds since the previous tick. */
  dtMs: number;
  /** True on the tick the pointer left the hero (forces settle-home). */
  pointerLeft?: boolean;
}

export interface ScrubMachineConfig {
  /** Active-band inset per side (fraction of hero width). */
  bandInset: number;
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

/** smoothstep, used to ease the blend-back handover and the touch intro. */
function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** ease-out cubic: fast start, gentle stop -- the settle-home feel. */
function easeOutCubic(t: number): number {
  const x = clamp01(t);
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

/** Map a raw pointer x (fraction across the hero) through the inner active
 * band: left of the band clamps to 0, right of it clamps to 1, linear in
 * between. Pure so the band-clamp rule is unit-testable. */
export function bandProgress(pointerX: number, inset: number): number {
  const span = 1 - 2 * inset;
  if (span <= 0) return clamp01(pointerX); // degenerate: no usable band.
  return clamp01((pointerX - inset) / span);
}

/** Fresh machine state parked at sequence start. Pointer-controlled unless
 * `touch` is set, in which case it begins the one-shot settle-through. */
export function initialScrubState(
  config: Partial<ScrubMachineConfig> = {},
): ScrubMachineState {
  const bandInset = config.bandInset ?? DEFAULT_BAND_INSET;
  const settleDurationMs = config.settleMs ?? DEFAULT_SETTLE_MS;
  const touch = config.touch ?? false;
  return {
    progress: 0,
    target: 0,
    pointerTarget: 0,
    mode: touch ? "touch" : "pointer",
    idleMs: 0,
    blendMs: 0,
    blendFrom: 0,
    settleMs: 0,
    settleFrom: 0,
    settleTo: 0,
    touchMs: 0,
    bandInset,
    settleDurationMs,
    fpsWindowMs: 0,
    fpsWindowFrames: 0,
    lowFpsSeconds: 0,
    fps: 0,
    belowThreshold: false,
  };
}

/** Begin easing home toward the nearest assembled extreme (Revision 2). */
function enterSettle(next: ScrubMachineState, fromProgress: number): void {
  next.mode = "settle";
  next.settleMs = 0;
  next.settleFrom = fromProgress;
  next.settleTo = fromProgress < SHOT_MOMENT ? 0 : 1;
}

/** Advance the machine one tick. Pure: same (state, input) -> same state. */
export function step(state: ScrubMachineState, input: ScrubInput): ScrubMachineState {
  const dt = input.dtMs > 0 ? input.dtMs : 0;
  const next: ScrubMachineState = { ...state };

  // --- fps windowing (independent of scrub mode) ---
  next.fpsWindowMs = state.fpsWindowMs + dt;
  next.fpsWindowFrames = state.fpsWindowFrames + 1;
  if (next.fpsWindowMs >= 1000) {
    next.fps = (next.fpsWindowFrames * 1000) / next.fpsWindowMs;
    next.lowFpsSeconds =
      next.fps < LOW_FPS_THRESHOLD ? state.lowFpsSeconds + 1 : 0;
    if (next.lowFpsSeconds >= LOW_FPS_SECONDS_TO_TRIP) next.belowThreshold = true;
    next.fpsWindowMs = 0;
    next.fpsWindowFrames = 0;
  }

  // --- touch one-shot intro: ignore the pointer, ramp 0 -> 1 once, rest ---
  if (state.mode === "touch") {
    next.touchMs = state.touchMs + dt;
    next.target = smoothstep(clamp01(next.touchMs / TOUCH_INTRO_MS));
    const alpha = 1 - Math.exp(-dt / CHASE_TAU_MS);
    next.progress = clamp01(state.progress + (next.target - state.progress) * alpha);
    return next;
  }

  const pointerMoved = input.pointerX !== null;
  if (pointerMoved) {
    next.pointerTarget = bandProgress(input.pointerX as number, state.bandInset);
    next.idleMs = 0;
    // Returning from settle-home never snaps: kick off a timed blend-back.
    if (state.mode === "settle") {
      next.mode = "blend";
      next.blendMs = 0;
      next.blendFrom = state.progress;
    }
  } else {
    next.idleMs = state.idleMs + dt;
  }

  // --- transition into settle-home: 3s idle, or the pointer left the hero ---
  const wentIdle = !pointerMoved && next.idleMs >= IDLE_THRESHOLD_MS;
  const leftHero = input.pointerLeft === true;
  if ((wentIdle || leftHero) && next.mode !== "settle") {
    enterSettle(next, state.progress);
  }

  // --- decide this tick's target from the mode ---
  if (next.mode === "settle") {
    next.settleMs = (state.mode === "settle" ? state.settleMs : 0) + dt;
    const k = easeOutCubic(next.settleMs / state.settleDurationMs);
    next.target = next.settleFrom + (next.settleTo - next.settleFrom) * k;
  } else if (next.mode === "blend") {
    next.blendMs = (state.mode === "blend" ? state.blendMs : 0) + dt;
    const k = smoothstep(next.blendMs / BLEND_MS);
    next.target = next.blendFrom + (next.pointerTarget - next.blendFrom) * k;
    if (next.blendMs >= BLEND_MS) {
      next.mode = "pointer";
      next.blendMs = 0;
    }
  } else {
    // pointer mode
    next.target = next.pointerTarget;
  }

  // --- eased chase toward target (critically-damped, no overshoot) ---
  const alpha = 1 - Math.exp(-dt / CHASE_TAU_MS);
  next.progress = clamp01(state.progress + (next.target - state.progress) * alpha);

  return next;
}
