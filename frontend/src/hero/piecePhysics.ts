// Baby physics sim for the fractured wordmark pieces -- docs/design/08
// (Revision 7). Supersedes the Revision 6 sine drift.
//
// Each separated piece carries an OFFSET (relative to its progress-driven
// base transform from shards.ts) and a VELOCITY, integrated per frame:
//   - a weak spring pulls the offset back toward 0 (the base position), so
//     the float wanders around where the break put the piece and reassembly
//     still lands exactly at the lockup when progress settles home;
//   - light damping keeps it lazy, not springy;
//   - a seeded smooth wander force keeps every piece ALIVE THE INSTANT it
//     separates (plus a seeded velocity kick on the separation edge --
//     "start floating instantly");
//   - the CURSOR repels: a smooth falloff force pushes nearby pieces away;
//   - offsets/velocities hard-clamp (a float, never a scatter) and snap to
//     exact zero once the piece is no longer separated (pixel-perfect
//     reassembly at progress 0, same contract as before).
//
// DOM-free and deterministic: same construction + same step sequence =>
// same state (the wander is seeded sines of accumulated sim time). State is
// mutated in place -- this runs per frame for ~100 pieces, zero allocations.

import { hash01, clamp01 } from "./branching";
import type { Shard } from "./shards";

/** Shatter amount at which the float is FULLY on. Small on purpose: pieces
 * are already floating the instant separation is visible. */
const GATE_FULL_SHATTER = 0.12;

/** Spring stiffness toward the base position (1/s^2). ~5s wander period. */
const SPRING_K = 1.8;
/** Velocity damping (1/s). Underdamped: lazy float, not a snap-back. */
const DAMP_C = 1.1;
/** Wander force amplitude (viewBox units / s^2). */
const NOISE_F = 34;
/** Separation-edge velocity kick (viewBox units / s). */
const KICK_V = 10;
/** Cursor repulsion: radius (viewBox units) and peak force (units/s^2). */
export const CURSOR_RADIUS = 95;
const CURSOR_F = 1400;
/** Hard bounds: max float offset and max velocity. */
export const MAX_OFFSET = 20;
const MAX_V = 80;
/** Rotation wobble amplitude (degrees), gated like the offsets. */
const ROT_WOBBLE_DEG = 2;
/** Integration clamp: a single step never integrates more than this (ms). */
const MAX_STEP_MS = 50;

export interface PiecePhysicsState {
  /** Current float offsets (viewBox units), added to the base transform. */
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  /** Velocities (viewBox units / s). */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Previous gate per piece (kick fires on the 0 -> separated edge). */
  readonly prevGate: Float32Array;
  /** Accumulated sim time (ms) driving the seeded wander sines. */
  timeMs: number;
}

export interface PiecePhysicsInput {
  /** Wall-clock ms since the previous step (internally clamped). */
  dtMs: number;
  /** Current shatter amount in [0,1] (shards.ts shatterAmount). */
  shatter: number;
  /** Pointer in viewBox coords, or null when it is not over the hero. */
  pointerX: number | null;
  pointerY: number | null;
}

/** Fresh all-zero physics state for `count` pieces. */
export function createPiecePhysics(count: number): PiecePhysicsState {
  return {
    ox: new Float32Array(count),
    oy: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    prevGate: new Float32Array(count),
    timeMs: 0,
  };
}

/** Seeded smooth wander force in [-1, 1]: two incommensurate sines. */
function wander(seed: number, tSec: number): number {
  const w1 = 1.1 + hash01(seed) * 2.2; // rad/s, ~0.18-0.53 Hz
  const w2 = 0.5 + hash01(seed + 1) * 1.1;
  const p1 = hash01(seed + 2) * Math.PI * 2;
  const p2 = hash01(seed + 3) * Math.PI * 2;
  return 0.65 * Math.sin(w1 * tSec + p1) + 0.35 * Math.sin(w2 * tSec + p2);
}

/** Rotation wobble for piece `seed` at the state's current time, degrees.
 * Gated by the same instant-on envelope as the offsets. */
export function rotWobbleDeg(state: PiecePhysicsState, seed: number, shatter: number): number {
  const gate = clamp01(shatter / GATE_FULL_SHATTER);
  if (gate <= 0) return 0;
  return gate * ROT_WOBBLE_DEG * wander(seed * 13 + 11, state.timeMs / 1000);
}

/** Advance the sim one frame. `baseX`/`baseY` are the pieces' current
 * progress-driven positions (centroid + base translate), used by the cursor
 * force so pushes act where pieces visibly are. Mutates `state` in place. */
export function stepPiecePhysics(
  state: PiecePhysicsState,
  pieces: readonly Shard[],
  baseX: Float32Array,
  baseY: Float32Array,
  input: PiecePhysicsInput,
): void {
  const dt = Math.min(Math.max(0, input.dtMs), MAX_STEP_MS) / 1000;
  state.timeMs += Math.min(Math.max(0, input.dtMs), MAX_STEP_MS);
  const tSec = state.timeMs / 1000;
  const gate = clamp01(input.shatter / GATE_FULL_SHATTER);
  const { ox, oy, vx, vy, prevGate } = state;
  const px = input.pointerX;
  const py = input.pointerY;

  for (let i = 0; i < pieces.length; i++) {
    if (gate <= 0) {
      // Not separated: exact zero so reassembly at progress 0 is identity.
      ox[i] = 0;
      oy[i] = 0;
      vx[i] = 0;
      vy[i] = 0;
      prevGate[i] = 0;
      continue;
    }
    const seed = pieces[i].seed;
    if (prevGate[i] <= 0) {
      // Separation edge: seeded kick so the float is alive on frame one.
      const a = hash01(seed * 5 + 4) * Math.PI * 2;
      vx[i] += Math.cos(a) * KICK_V;
      vy[i] += Math.sin(a) * KICK_V;
    }
    prevGate[i] = gate;

    // Forces: spring home, damping, seeded wander, cursor repulsion.
    let ax = -SPRING_K * ox[i] - DAMP_C * vx[i] + NOISE_F * gate * wander(seed * 13 + 1, tSec);
    let ay = -SPRING_K * oy[i] - DAMP_C * vy[i] + NOISE_F * gate * wander(seed * 13 + 5, tSec);
    if (px !== null && py !== null) {
      const dx = baseX[i] + ox[i] - px;
      const dy = baseY[i] + oy[i] - py;
      const d = Math.hypot(dx, dy);
      if (d < CURSOR_RADIUS && d > 1e-3) {
        const fall = 1 - d / CURSOR_RADIUS;
        const f = (CURSOR_F * fall * fall * gate) / d;
        ax += dx * f;
        ay += dy * f;
      }
    }

    // Semi-implicit Euler + hard bounds.
    vx[i] = Math.max(-MAX_V, Math.min(MAX_V, vx[i] + ax * dt));
    vy[i] = Math.max(-MAX_V, Math.min(MAX_V, vy[i] + ay * dt));
    ox[i] = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, ox[i] + vx[i] * dt));
    oy[i] = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, oy[i] + vy[i] * dt));
  }
}
