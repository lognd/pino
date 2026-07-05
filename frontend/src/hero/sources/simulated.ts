// SimulatedSource (v1) -- docs/design/08-landing-hero.md (Revision 4).
//
// Procedural canvas-2D firing sequence, strictly black/red/white (doc 09
// palette). NO weapon is ever drawn and -- Revision 4 -- NO CASING either (user
// verdict: "doesn't look good at all"). The sequence is now light, smoke, and
// the breaking wordmark only.
//
// THE FLASH IS LIGHT ON THE SCENE, NOT AN OBJECT (Revision 4 ground-up rework;
// reference: real low-light muzzle-flash photography -- harsh, brief, mostly
// OVEREXPOSURE and rim light, almost never a visible fireball). Built as: a
// sub-perceptual bloom at the off-frame origin, a hard single-beat exposure lift
// of the whole field, rim light raking the wordmark from the origin side, a
// short-lived atmospheric glow in the smoke, then decay. No drawn starburst, no
// petal shapes, no lens-flare streaks -- nothing with a nameable cartoon shape.
//
// SELECTABLE FLASH PROTOTYPES (Revision 4): three finished treatments of the
// same exposure/rim idea (`FlashVariant`), all within the photosensitivity
// guard. Default is "exposure"; /hero-lab exposes the selector.
//
// PURITY + PHOTOSENSITIVITY. Every scene field is a PURE, CONTINUOUS function of
// progress (`sceneParams`) -- no hard gates, so scrubbing produces no field
// discontinuity (the mid-sequence "crash" is gone; see the regression test).
// The ONE deliberately stateful thing is the WCAG 2.3.1 flash guard: the
// displayed flash luminance is rate-clamped in wall-clock time
// (clampLuminanceStep) and at most one flash fires per engagement cycle, so no
// amount of fast/jittery scrubbing can strobe it.

import type { ScrubSource } from "../timeline";
import {
  SHOT_MOMENT,
  ORIGIN_FX,
  ORIGIN_FY,
  flashEnvelope,
  FlashGuard,
} from "../timeline";

const BLACK = "#000000";
const WHITE = "#F4F4F2";

const SMOKE_COUNT = 6;
const GRAIN_TILE = 96;

/** The selectable flash treatments (all exposure/rim, all within the guard). */
export type FlashVariant = "exposure" | "rake" | "ember";
export const FLASH_VARIANTS: FlashVariant[] = ["exposure", "rake", "ember"];
export const DEFAULT_FLASH_VARIANT: FlashVariant = "exposure";

function hash01(seed: number): number {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Continuous scene fields for a given progress + variant. PURE and total: no
 * hard gates anywhere, every term reaches 0 at its tail, so sampling across
 * progress yields only small steps (the field-continuity regression test). */
export interface SceneParams {
  /** Full-field over-exposure lift (white wash), the single hard beat. */
  exposure: number;
  /** Origin bloom alpha (light spilling in from off-frame). */
  bloom: number;
  /** Origin bloom radius factor (fraction of field height). */
  bloomRadius: number;
  /** Directional rim-rake alpha across the field from the origin edge. */
  rim: number;
  /** Extra atmospheric glow lift inside the smoke during the beat. */
  smokeGlow: number;
  /** Smoke drift fraction in [0,1] (how far past the shot the smoke has moved). */
  smokeTravel: number;
  /** Base smoke alpha envelope (rises after the shot, then thins). */
  smokeAmount: number;
}

export function sceneParams(progress: number, variant: FlashVariant): SceneParams {
  const p = clamp01(progress);
  const env = flashEnvelope(p); // shared single beat, peak at SHOT_MOMENT.
  // A rim beat sitting a hair AFTER the exposure peak (asymmetric, continuous).
  const rd = (p - (SHOT_MOMENT + 0.03)) / 0.06;
  const rimEnv = Math.exp(-rd * rd);
  // Progress past the shot, eased -- drives smoke drift (continuous, 0 below).
  const after = clamp01((p - SHOT_MOMENT) / (1 - SHOT_MOMENT));
  const smokeTravel = smoothstep(after);
  const smokeAmount = Math.sin(Math.PI * clamp01(after)) * 0.85;

  // Ember tail: a slow warm bloom decay AFTER the beat (continuous: a wide
  // gaussian gated smoothly to the forward side only).
  const emberTail =
    0.3 * Math.exp(-Math.pow((p - SHOT_MOMENT) / 0.3, 2)) * smoothstep((p - SHOT_MOMENT) / 0.05);

  switch (variant) {
    case "rake":
      // Less full-field blowout, more directional rim + atmospheric glow.
      return {
        exposure: env * 0.24,
        bloom: env * 0.5,
        bloomRadius: 0.4 + 0.55 * env,
        rim: rimEnv * 1.05,
        smokeGlow: env * 0.55,
        smokeTravel,
        smokeAmount,
      };
    case "ember":
      // Warm, softer, lingering origin bloom that decays slowly.
      return {
        exposure: env * 0.3,
        bloom: env * 0.62 + emberTail,
        bloomRadius: 0.45 + 0.6 * env,
        rim: rimEnv * 0.7,
        smokeGlow: env * 0.45 + emberTail * 0.6,
        smokeTravel,
        smokeAmount,
      };
    case "exposure":
    default:
      // Hard single-beat over-exposure lift, tight origin bloom, clean decay.
      return {
        exposure: env * 0.55,
        bloom: env * 0.8,
        bloomRadius: 0.35 + 0.7 * env,
        rim: rimEnv * 0.8,
        smokeGlow: env * 0.4,
        smokeTravel,
        smokeAmount,
      };
  }
}

export class SimulatedSource implements ScrubSource {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private variant: FlashVariant;

  // Seeded-once smoke parameter tables (no per-frame alloc).
  private readonly smokeAngle = new Float32Array(SMOKE_COUNT);
  private readonly smokeSpread = new Float32Array(SMOKE_COUNT);
  private readonly smokePhase = new Float32Array(SMOKE_COUNT);

  // Pre-created gradients.
  private bloomGrad: CanvasGradient | null = null;
  private coreGrad: CanvasGradient | null = null;
  private rimGrad: CanvasGradient | null = null;
  private smokeGrad: CanvasGradient | null = null;
  private spillGrad: CanvasGradient | null = null;
  private vignetteGrad: CanvasGradient | null = null;
  private grainTile: CanvasPattern | null = null;

  // --- WCAG 2.3.1 flash guard (the one deliberately stateful bit) ---
  /** Rate-clamps + one-per-cycle-latches the displayed flash luminance. */
  private readonly guard = new FlashGuard();
  /** Wall-clock time of the previous render (ms), or null before the first. */
  private lastTimeMs: number | null = null;
  /** Last rendered progress + guard settledness, for the quiescence check. */
  private lastProgress = -1;
  private lastSettled = false;

  constructor(variant: FlashVariant = DEFAULT_FLASH_VARIANT) {
    this.variant = variant;
  }

  /** Switch the flash treatment (used by /hero-lab's variant selector). */
  setVariant(variant: FlashVariant): void {
    this.variant = variant;
  }

  getVariant(): FlashVariant {
    return this.variant;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d");
    this.ctx = ctx;
    this.w = canvas.width;
    this.h = canvas.height;
    const w = this.w;
    const h = this.h;
    const originY = h * ORIGIN_FY;

    for (let i = 0; i < SMOKE_COUNT; i++) {
      this.smokeAngle[i] = -0.5 + (hash01(i * 5 + 1) - 0.5) * 1.1;
      this.smokeSpread[i] = 0.4 + hash01(i * 5 + 2) * 0.6;
      this.smokePhase[i] = hash01(i * 5 + 3);
    }

    if (ctx) {
      // Origin bloom: an overexposed WHITE-dominant halo with a brief red skirt
      // (photographic muzzle light is mostly blown-out white, not a red ball).
      const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      bloom.addColorStop(0, "rgba(244,244,242,0.85)");
      bloom.addColorStop(0.25, "rgba(244,244,242,0.32)");
      bloom.addColorStop(0.5, "rgba(232,17,45,0.18)");
      bloom.addColorStop(1, "rgba(232,17,45,0)");
      this.bloomGrad = bloom;
      // White-hot core with inverse-square-ish falloff (collapses fast).
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(0.12, "rgba(248,246,240,0.8)");
      core.addColorStop(0.3, "rgba(244,244,242,0.36)");
      core.addColorStop(0.6, "rgba(244,244,242,0.1)");
      core.addColorStop(1, "rgba(244,244,242,0)");
      this.coreGrad = core;
      // Thin red rim just outside the hot core (one brief beat).
      const rim = ctx.createRadialGradient(0, 0, 0.6, 0, 0, 1);
      rim.addColorStop(0, "rgba(232,17,45,0)");
      rim.addColorStop(0.72, "rgba(232,17,45,0.5)");
      rim.addColorStop(0.86, "rgba(255,120,140,0.45)");
      rim.addColorStop(1, "rgba(232,17,45,0)");
      this.rimGrad = rim;
      const smoke = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      smoke.addColorStop(0, "rgba(244,244,242,0.2)");
      smoke.addColorStop(1, "rgba(244,244,242,0)");
      this.smokeGrad = smoke;
      // Directional rim-rake: brightest at the origin edge, fading by mid-frame.
      const spill = ctx.createLinearGradient(0, originY, w * 0.6, originY);
      spill.addColorStop(0, "rgba(244,244,242,0.55)");
      spill.addColorStop(0.12, "rgba(232,17,45,0.3)");
      spill.addColorStop(0.4, "rgba(232,17,45,0.08)");
      spill.addColorStop(1, "rgba(232,17,45,0)");
      this.spillGrad = spill;
      const vig = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        Math.min(w, h) * 0.25,
        w * 0.5,
        h * 0.5,
        Math.hypot(w, h) * 0.6,
      );
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      this.vignetteGrad = vig;

      this.grainTile = this.buildGrain(ctx);
    }
    this.guard.reset();
    this.lastTimeMs = null;
    this.lastProgress = -1;
    this.lastSettled = false;
    return Promise.resolve();
  }

  /** True when re-rendering the same progress would repaint identical pixels
   * (no guard decay pending) -- lets the composition skip idle frames. */
  isQuiescent(progress: number): boolean {
    return this.lastSettled && Math.abs(progress - this.lastProgress) < 1e-5;
  }

  render(progress: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = clamp01(progress);
    const w = this.w;
    const h = this.h;
    const originX = w * ORIGIN_FX;
    const originY = h * ORIGIN_FY;
    const s = sceneParams(p, this.variant);

    // --- WCAG 2.3.1 flash guard (wall-clock rate clamp + one-per-cycle) ------
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const dt = this.lastTimeMs === null ? 0 : now - this.lastTimeMs;
    this.lastTimeMs = now;
    // Representative flash luminance; the guard rate-clamps it and lets the
    // FIRST full beat display (rise AND decay) before latching one-per-cycle.
    const targetFlash = Math.max(s.exposure, s.bloom * 0.7);
    const dispFlash = this.guard.step(targetFlash, p, dt);
    this.lastProgress = p;
    this.lastSettled = this.guard.settled(targetFlash);
    // Scale every bright flash layer by the clamped/target ratio so the guard
    // governs bloom + rim together, not just the white wash.
    const flashScale = targetFlash > 1e-4 ? clamp01(dispFlash / targetFlash) : 0;

    // --- black field --------------------------------------------------------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";

    // Full-field over-exposure lift (the single hard beat), rate-clamped.
    const exposure = s.exposure * flashScale;
    if (exposure > 0.002) {
      ctx.globalAlpha = clamp01(exposure);
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Directional rim-rake in from the origin edge (not a fireball).
    const rim = s.rim * flashScale;
    if (rim > 0.005 && this.spillGrad) {
      ctx.globalAlpha = clamp01(rim);
      ctx.fillStyle = this.spillGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Origin bloom: overexposed halo + hot core + thin red rim, anchored at the
    // off-frame origin so brightness reads as light spilling in from the left.
    const bloom = s.bloom * flashScale;
    if (bloom > 0.005 && this.bloomGrad && this.coreGrad) {
      const haloR = h * (0.4 + s.bloomRadius);
      this.drawUnitGradient(ctx, this.bloomGrad, originX, originY, haloR, bloom * 0.9);
      const coreRy = h * (0.1 + 0.3 * s.bloomRadius);
      this.drawAnamorphic(ctx, this.coreGrad, originX, originY, coreRy * 2.2, coreRy, bloom);
      if (this.rimGrad && rim > 0.01) {
        const rimR = h * (0.22 + 0.4 * s.bloomRadius);
        this.drawAnamorphic(ctx, this.rimGrad, originX, originY, rimR * 1.8, rimR, rim * 0.8);
      }
    }

    // Smoke: soft puffs whose positions are FUNCTIONS of progress, drifting in
    // from the origin edge; a brief atmospheric glow lifts them during the beat.
    if (s.smokeAmount > 0.001 && this.smokeGrad) {
      const glow = s.smokeGlow * flashScale;
      for (let i = 0; i < SMOKE_COUNT; i++) {
        const travel = s.smokeTravel * (0.5 + this.smokePhase[i] * 0.5);
        const a = this.smokeAngle[i];
        const dist = w * 0.5 * travel * this.smokeSpread[i];
        const sx = originX + Math.cos(a) * dist;
        const sy = originY + Math.sin(a) * dist;
        const r = h * (0.1 + 0.32 * travel);
        const alpha = s.smokeAmount * Math.sin(Math.PI * clamp01(travel));
        // Near-origin puffs pick up the flash glow briefly.
        const nearOrigin = 1 - clamp01(dist / (w * 0.4));
        this.drawUnitGradient(ctx, this.smokeGrad, sx, sy, r, alpha + glow * nearOrigin * 0.4);
      }
    }

    // Vignette (deliberate, finished frame).
    if (this.vignetteGrad) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.vignetteGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Film grain: static, subtle, over the whole field.
    if (this.grainTile) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = this.grainTile;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  private drawUnitGradient(
    ctx: CanvasRenderingContext2D,
    grad: CanvasGradient,
    x: number,
    y: number,
    radius: number,
    alpha: number,
  ): void {
    ctx.globalAlpha = clamp01(alpha);
    ctx.setTransform(radius, 0, 0, radius, x, y);
    ctx.fillStyle = grad;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  private drawAnamorphic(
    ctx: CanvasRenderingContext2D,
    grad: CanvasGradient,
    x: number,
    y: number,
    rx: number,
    ry: number,
    alpha: number,
  ): void {
    ctx.globalAlpha = clamp01(alpha);
    ctx.setTransform(rx, 0, 0, ry, x, y);
    ctx.fillStyle = grad;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  private buildGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    try {
      const off = document.createElement("canvas");
      off.width = GRAIN_TILE;
      off.height = GRAIN_TILE;
      const octx = off.getContext("2d");
      if (!octx) return null;
      const img = octx.createImageData(GRAIN_TILE, GRAIN_TILE);
      const data = img.data;
      for (let i = 0; i < GRAIN_TILE * GRAIN_TILE; i++) {
        const v = Math.floor(hash01(i * 2 + 1) * 255);
        data[i * 4] = v;
        data[i * 4 + 1] = v;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      return ctx.createPattern(off, "repeat");
    } catch {
      return null;
    }
  }

  posterUrl(): string {
    return "/brand/hero-poster.svg";
  }

  dispose(): void {
    this.ctx = null;
    this.bloomGrad = null;
    this.coreGrad = null;
    this.rimGrad = null;
    this.smokeGrad = null;
    this.spillGrad = null;
    this.vignetteGrad = null;
    this.grainTile = null;
  }
}
