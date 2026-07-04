// SimulatedSource (v1) -- docs/design/08-landing-hero.md.
//
// Procedural canvas-2D firing sequence, stylized graphic-novel-bold and
// strictly black/red/white (doc 09 palette). Everything is a PURE function
// of `progress`: the muzzle bloom, spark streaks, casing arc, and smoke
// particle positions are all evaluated from `progress` each frame with NO
// per-frame integration and NO per-frame allocation -- all randomness is
// seeded once in init() and all gradients are pre-created in unit space and
// merely transformed at draw time. That is what makes reverse scrubbing
// free (same progress in -> same pixels out).

import type { ScrubSource } from "../timeline";
import { SHOT_MOMENT } from "../timeline";

const BLACK = "#000000";
const WHITE = "#F4F4F2";
const RED = "#E8112D";

const SMOKE_COUNT = 6;
const SPARK_COUNT = 7;

// Muzzle anchor as a fraction of the canvas (left-of-center, mid-height).
const MUZZLE_FX = 0.32;
const MUZZLE_FY = 0.52;

/** Deterministic [0,1) hash of an integer seed (stateless mulberry mix). */
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

export class SimulatedSource implements ScrubSource {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;

  // Pre-allocated, seeded-once particle parameter tables (no per-frame alloc).
  private readonly smokeAngle = new Float32Array(SMOKE_COUNT);
  private readonly smokeSpread = new Float32Array(SMOKE_COUNT);
  private readonly smokePhase = new Float32Array(SMOKE_COUNT);
  private readonly sparkAngle = new Float32Array(SPARK_COUNT);
  private readonly sparkLen = new Float32Array(SPARK_COUNT);

  // Pre-created unit-space gradients (radius 1, centered at origin).
  private bloomGrad: CanvasGradient | null = null;
  private coreGrad: CanvasGradient | null = null;
  private smokeGrad: CanvasGradient | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d");
    this.ctx = ctx;
    this.w = canvas.width;
    this.h = canvas.height;

    // Seed the particle tables ONCE.
    for (let i = 0; i < SMOKE_COUNT; i++) {
      this.smokeAngle[i] = (hash01(i * 5 + 1) - 0.5) * 1.4 - Math.PI / 2;
      this.smokeSpread[i] = 0.4 + hash01(i * 5 + 2) * 0.6;
      this.smokePhase[i] = hash01(i * 5 + 3);
    }
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkAngle[i] = hash01(i * 3 + 11) * Math.PI * 2;
      this.sparkLen[i] = 0.5 + hash01(i * 3 + 12) * 0.5;
    }

    if (ctx) {
      // Red halo bloom, unit radius.
      const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      bloom.addColorStop(0, "rgba(232,17,45,0.95)");
      bloom.addColorStop(0.35, "rgba(232,17,45,0.55)");
      bloom.addColorStop(1, "rgba(232,17,45,0)");
      this.bloomGrad = bloom;
      // White-hot core, unit radius.
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      core.addColorStop(0, "rgba(244,244,242,1)");
      core.addColorStop(0.5, "rgba(244,244,242,0.7)");
      core.addColorStop(1, "rgba(244,244,242,0)");
      this.coreGrad = core;
      // Soft smoke puff, unit radius (near-white, low alpha).
      const smoke = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      smoke.addColorStop(0, "rgba(244,244,242,0.22)");
      smoke.addColorStop(1, "rgba(244,244,242,0)");
      this.smokeGrad = smoke;
    }
    return Promise.resolve();
  }

  render(progress: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = clamp01(progress);
    const w = this.w;
    const h = this.h;
    const mx = w * MUZZLE_FX;
    const my = h * MUZZLE_FY;

    // Black field (doc 09: hero ground is true black).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);

    // Bloom intensity: a bump peaking at SHOT_MOMENT, decaying either side.
    const bloom = Math.exp(-Math.pow((p - SHOT_MOMENT) / 0.11, 2));
    // How far past the shot we are, in [0,1] (drives casing + smoke travel).
    const after = clamp01((p - SHOT_MOMENT) / (1 - SHOT_MOMENT));

    ctx.globalCompositeOperation = "lighter";

    // Muzzle bloom: red halo then white core, radius grows with intensity.
    if (bloom > 0.01 && this.bloomGrad && this.coreGrad) {
      const haloR = h * (0.18 + 0.5 * bloom);
      this.drawUnitGradient(ctx, this.bloomGrad, mx, my, haloR, bloom);
      const coreR = h * (0.06 + 0.22 * bloom);
      this.drawUnitGradient(ctx, this.coreGrad, mx, my, coreR, bloom);
    }

    // Spark streaks radiating from the muzzle, length scales with bloom.
    if (bloom > 0.02) {
      ctx.lineWidth = Math.max(1, h * 0.006);
      ctx.strokeStyle = WHITE;
      ctx.globalAlpha = bloom;
      for (let i = 0; i < SPARK_COUNT; i++) {
        const len = h * 0.28 * this.sparkLen[i] * bloom;
        const a = this.sparkAngle[i];
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Smoke: soft puffs whose positions are FUNCTIONS of progress. They
    // rise and spread the further past the shot we are, then thin out.
    if (after > 0 && this.smokeGrad) {
      for (let i = 0; i < SMOKE_COUNT; i++) {
        const travel = after * (0.5 + this.smokePhase[i] * 0.5);
        const a = this.smokeAngle[i];
        const dist = h * 0.55 * travel * this.smokeSpread[i];
        const sx = mx + Math.cos(a) * dist;
        const sy = my + Math.sin(a) * dist;
        const r = h * (0.1 + 0.32 * travel);
        const alpha = Math.sin(Math.PI * clamp01(travel)) * 0.9;
        this.drawUnitGradient(ctx, this.smokeGrad, sx, sy, r, alpha);
      }
    }

    // Casing arc: a small white shell on a parametric ballistic path,
    // ejecting up-right after the shot and falling under "gravity".
    if (after > 0) {
      const s = after;
      const cx = mx + w * 0.16 * s;
      const cy = my - h * 0.28 * Math.sin(Math.PI * s) + h * 0.02 * s;
      const spin = s * Math.PI * 4;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = clamp01(1 - s * 0.3);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      const cw = w * 0.012;
      const ch = h * 0.04;
      ctx.fillStyle = WHITE;
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.fillStyle = RED;
      ctx.fillRect(-cw / 2, ch / 2 - ch * 0.22, cw, ch * 0.22);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Reset for the next consumer.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /** Draw a unit-space radial gradient at (x,y) scaled to `radius` with a
   * given alpha -- avoids per-frame gradient allocation. */
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

  posterUrl(): string {
    return "/brand/hero-poster.svg";
  }

  dispose(): void {
    this.ctx = null;
    this.bloomGrad = null;
    this.coreGrad = null;
    this.smokeGrad = null;
  }
}
