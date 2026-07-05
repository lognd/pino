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
import { VIEW_W, VIEW_H, type Shard } from "./shards";

/** Shatter amount at which the float is FULLY on. Small on purpose: pieces
 * are already floating the instant separation is visible. */
const GATE_FULL_SHATTER = 0.12;

/** Spring stiffness toward the base position (1/s^2). Deliberately WEAK: a
 * loose tether, so momentum and the field border -- not the tether -- shape
 * where the debris ends up (the self-balancing shatter). */
const SPRING_K = 0.6;
/** Velocity damping (1/s). Underdamped: lazy float, not a snap-back. */
const DAMP_C = 1.1;
/** Wander force amplitude (viewBox units / s^2). */
const NOISE_F = 34;
/** Separation-edge kick: radial speed (units/s) plus tangential scatter.
 * Real momentum from the shot -- pieces keep it until forces turn them. */
const KICK_RADIAL = 22;
const KICK_TANGENTIAL = 8;
/** Cursor repulsion: radius (viewBox units) and peak force (units/s^2). */
export const CURSOR_RADIUS = 95;
const CURSOR_F = 1400;
/** Soft repulsive FIELD BORDER: pieces whose (base + offset) position
 * crosses the margin get pushed back in, force proportional to
 * penetration, velocity untouched (no momentum reset) -- pieces deflect
 * and redistribute instead of piling at the impact-opposite edge or
 * leaving the render. */
const BORDER_MARGIN = 12;
const BORDER_K = 30;
/** Hard bounds: max float offset (scaled by the roam envelope below) and
 * max velocity. */
export const MAX_OFFSET = 60;
const MAX_V = 80;
/** Roam room grows with disintegration: at this shatter the full MAX_OFFSET
 * is available; below it the float stays proportionally tighter, so a
 * barely-cracked lockup cannot explode past what progress says. */
const ROAM_FULL_SHATTER = 0.5;
/** Rotation wobble amplitude (degrees), gated like the offsets. */
const ROT_WOBBLE_DEG = 2;
/** Integration clamp: a single step never integrates more than this (ms). */
const MAX_STEP_MS = 50;

// Homing (the "pieces jump" fix): while shatter is FALLING (settle-home),
// the spring stiffens, damping goes overdamped, wanders die, and offsets
// contract exponentially -- so by the instant separation ends the float
// offset is already ~0 and the final snap-to-zero is invisible. Pieces
// "find their way back" instead of teleporting. Direction-aware on purpose:
// the same low shatter values on the way OUT must keep the instant float.
const HOME_START_SHATTER = 0.3;
const HOME_STIFFEN = 10;
const HOME_OVERDAMP = 4;
/** Exponential offset contraction rate at full homing (1/s). */
const HOME_CONTRACT_RATE = 8;
/** Smoothing time constant for the homing envelope (s), so direction
 * flicker from jittery input cannot pump it. */
const HOME_TAU_S = 0.15;

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
  /** Smoothed homing envelope in [0,1] (1 = fully on the way home). */
  homing: number;
  /** Shatter amount of the previous step (homing direction detector). */
  prevShatter: number;
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
    homing: 0,
    prevShatter: 0,
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

  // Homing envelope: rises only while shatter is falling (reassembling),
  // smoothed so direction flicker from jittery input cannot pump it.
  const falling = input.shatter < state.prevShatter - 1e-6;
  state.prevShatter = input.shatter;
  const homeTarget = falling ? 1 - clamp01(input.shatter / HOME_START_SHATTER) : 0;
  state.homing += (homeTarget - state.homing) * (1 - Math.exp(-dt / HOME_TAU_S));
  const home = state.homing;
  const k = SPRING_K * (1 + HOME_STIFFEN * home);
  const c = DAMP_C * (1 + HOME_OVERDAMP * home);
  const contract = home > 1e-3 ? Math.exp(-home * HOME_CONTRACT_RATE * dt) : 1;

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
    const piece = pieces[i];
    const seed = piece.seed;
    if (prevGate[i] <= 0) {
      // Separation edge: real radial momentum from the shot (nearer-impact
      // splinters faster) plus seeded tangential scatter -- alive on frame
      // one, and the momentum is what the border later redistributes.
      const radial = KICK_RADIAL * (0.6 + 0.8 * (1 - piece.distNorm));
      const tangential = (hash01(seed * 5 + 4) * 2 - 1) * KICK_TANGENTIAL;
      vx[i] += piece.dirX * radial - piece.dirY * tangential;
      vy[i] += piece.dirY * radial + piece.dirX * tangential;
    }
    prevGate[i] = gate;

    // Forces: spring home, damping, seeded wander (silenced while homing),
    // cursor repulsion, and the soft field border.
    const noiseGate = gate * (1 - home);
    let ax = -k * ox[i] - c * vx[i] + NOISE_F * noiseGate * wander(seed * 13 + 1, tSec);
    let ay = -k * oy[i] - c * vy[i] + NOISE_F * noiseGate * wander(seed * 13 + 5, tSec);
    const posX = baseX[i] + ox[i];
    const posY = baseY[i] + oy[i];
    if (px !== null && py !== null) {
      const dx = posX - px;
      const dy = posY - py;
      const d = Math.hypot(dx, dy);
      if (d < CURSOR_RADIUS && d > 1e-3) {
        const fall = 1 - d / CURSOR_RADIUS;
        const f = (CURSOR_F * fall * fall * gate) / d;
        ax += dx * f;
        ay += dy * f;
      }
    }
    // Border: linear-in-penetration inward push; velocities untouched, so
    // deflected pieces carry their momentum along the wall and spread.
    if (posX < BORDER_MARGIN) ax += BORDER_K * (BORDER_MARGIN - posX);
    else if (posX > VIEW_W - BORDER_MARGIN) ax -= BORDER_K * (posX - (VIEW_W - BORDER_MARGIN));
    if (posY < BORDER_MARGIN) ay += BORDER_K * (BORDER_MARGIN - posY);
    else if (posY > VIEW_H - BORDER_MARGIN) ay -= BORDER_K * (posY - (VIEW_H - BORDER_MARGIN));

    // Semi-implicit Euler + hard bounds (roam room grows with shatter).
    const roam = MAX_OFFSET * clamp01(input.shatter / ROAM_FULL_SHATTER);
    vx[i] = Math.max(-MAX_V, Math.min(MAX_V, vx[i] + ax * dt));
    vy[i] = Math.max(-MAX_V, Math.min(MAX_V, vy[i] + ay * dt));
    ox[i] = Math.max(-roam, Math.min(roam, ox[i] + vx[i] * dt));
    oy[i] = Math.max(-roam, Math.min(roam, oy[i] + vy[i] * dt));

    // Contraction guarantee: whatever the forces did, offsets shrink
    // exponentially while homing so gate-close lands at ~0 (no jump).
    if (contract < 1) {
      ox[i] *= contract;
      oy[i] *= contract;
      vx[i] *= contract;
      vy[i] *= contract;
    }
  }
}
