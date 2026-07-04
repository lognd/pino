// Pure scrub state machine -- docs/design/08-landing-hero.md.
//
// Extracted from useScrub.ts so the timing behaviour (eased chase, idle
// ping-pong drift, blend-back, low-fps guard) is testable without a DOM,
// a canvas, or a rAF loop. useScrub.ts is a thin rAF hook over `step`.
//
// The whole machine is a pure reducer: `step(state, input) -> newState`.
// No `Date.now`, no allocations of arrays, no side effects. Everything is
// driven by `dtMs` (elapsed real time this tick) and `pointerX` (the
// latest normalized [0,1] pointer position, or null when the pointer has
// not moved this tick). Determinism here is what makes the idle-drift and
// blend-back behaviours unit-testable.

/** Exponential-smoothing time constant for the eased chase (ms). progress
 * reaches ~94% of a step in ~2.8*TAU; with TAU=90ms that is ~250ms, the
 * midpoint of doc 08's "200-350ms settle" critically-damped feel. */
const CHASE_TAU_MS = 90;

/** No pointer movement for this long flips the machine into idle drift. */
export const IDLE_THRESHOLD_MS = 3000;

/** Idle drift covers the full [0,1] sweep in 20s == "~1/20 real speed"
 * (doc 08 treats one full 0->1 sweep as "real speed" == ~1s). */
const DRIFT_PROGRESS_PER_MS = 1 / 20 / 1000;

/** Blend from drift back to pointer control takes ~500ms, no snap. */
export const BLEND_MS = 500;

/** fps guard: below this for two consecutive 1s windows -> low power. */
const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_SECONDS_TO_TRIP = 2;

export type ScrubMode = "pointer" | "drift" | "blend";

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
  /** Drift direction for the ping-pong: +1 forward, -1 reverse. */
  driftDir: 1 | -1;
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
  /** Latest normalized pointer x in [0,1], or null if it did not move. */
  pointerX: number | null;
  /** Elapsed real milliseconds since the previous tick. */
  dtMs: number;
}

/** Fresh machine state parked at sequence start, pointer-controlled. */
export function initialScrubState(): ScrubMachineState {
  return {
    progress: 0,
    target: 0,
    pointerTarget: 0,
    mode: "pointer",
    idleMs: 0,
    blendMs: 0,
    blendFrom: 0,
    driftDir: 1,
    fpsWindowMs: 0,
    fpsWindowFrames: 0,
    lowFpsSeconds: 0,
    fps: 0,
    belowThreshold: false,
  };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** smoothstep, used to ease the blend-back handover. */
function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
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

  const pointerMoved = input.pointerX !== null;
  if (pointerMoved) {
    next.pointerTarget = clamp01(input.pointerX as number);
    next.idleMs = 0;
    // Returning from idle drift never snaps: kick off a timed blend-back.
    if (state.mode === "drift") {
      next.mode = "blend";
      next.blendMs = 0;
      next.blendFrom = state.progress;
    }
  } else {
    next.idleMs = state.idleMs + dt;
  }

  // --- decide this tick's target from the mode ---
  if (next.mode === "pointer") {
    if (!pointerMoved && next.idleMs >= IDLE_THRESHOLD_MS) {
      // Slip into idle drift, continuing forward from the parked frame.
      next.mode = "drift";
      next.driftDir = 1;
    }
  }

  if (next.mode === "drift") {
    let t = state.target + next.driftDir * DRIFT_PROGRESS_PER_MS * dt;
    let dir = next.driftDir;
    if (t >= 1) {
      t = 1;
      dir = -1; // ping-pong at the end
    } else if (t <= 0) {
      t = 0;
      dir = 1; // ping-pong at the start
    }
    next.driftDir = dir;
    next.target = t;
  } else if (next.mode === "blend") {
    next.blendMs = state.blendMs + dt;
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
