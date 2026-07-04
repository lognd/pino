// SimulatedSource (v1) -- docs/design/08-landing-hero.md (Revision 2).
//
// Procedural canvas-2D firing sequence, stylized graphic-novel-bold and
// strictly black/red/white (doc 09 palette). NO weapon is ever drawn. The
// whole scene is MOTIVATED by one off-frame origin just past the left edge at
// barrel height (timeline.ts ORIGIN_*): the muzzle "flash" is directional
// light SPILLING IN from that edge (a raking red/white bloom brightest at the
// origin, not a centered fireball); the casing ENTERS FRAME from the origin on
// a ballistic arc with tumble; the smoke drifts in from the same edge. A film
// grain + vignette sit over the whole field for a deliberate finish. No
// confetti-like sparks.
//
// Every visible element is a PURE function of `progress`: bloom, casing, and
// smoke positions are evaluated from `progress` each frame with NO per-frame
// integration. All randomness is seeded once in init(); gradients and the
// grain tile are created once in init() and merely transformed/blitted at draw
// time -- the render path allocates nothing. That purity is what makes reverse
// scrubbing free (same progress in -> same pixels out).
//
// INTERPRETATION (Revision 2 "ambient life at rest"): doc 08 asks the hero to
// stay "subtly alive through ambient smoke/grain" at rest, but also makes
// render() a HARD pure-function-of-progress invariant (swap contract). A live
// per-frame animation would need a time input and break that invariant, so we
// keep render pure: the grain/vignette give static texture, and the scrub
// state machine (not the source) owns all motion. Honoring the invariant wins.

import type { ScrubSource } from "../timeline";
import { SHOT_MOMENT, ORIGIN_FX, ORIGIN_FY } from "../timeline";

const BLACK = "#000000";
const WHITE = "#F4F4F2";
const RED = "#E8112D";

const SMOKE_COUNT = 6;
/** Grain tile size in device px (blitted, scaled, tiled -- allocated once). */
const GRAIN_TILE = 96;

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

  // Pre-allocated, seeded-once smoke parameter tables (no per-frame alloc).
  private readonly smokeAngle = new Float32Array(SMOKE_COUNT);
  private readonly smokeSpread = new Float32Array(SMOKE_COUNT);
  private readonly smokePhase = new Float32Array(SMOKE_COUNT);

  // Pre-created gradients (unit-space radials + a canvas-space spill/vignette).
  private bloomGrad: CanvasGradient | null = null;
  private coreGrad: CanvasGradient | null = null;
  private smokeGrad: CanvasGradient | null = null;
  private spillGrad: CanvasGradient | null = null;
  private vignetteGrad: CanvasGradient | null = null;
  private grainTile: CanvasPattern | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d");
    this.ctx = ctx;
    this.w = canvas.width;
    this.h = canvas.height;
    const w = this.w;
    const h = this.h;
    const originX = w * ORIGIN_FX; // off-frame left.
    const originY = h * ORIGIN_FY;

    // Seed the smoke table ONCE (drifts in and up from the origin edge).
    for (let i = 0; i < SMOKE_COUNT; i++) {
      // Angles fan into the frame (rightward + up), never back off-screen.
      this.smokeAngle[i] = -0.5 + (hash01(i * 5 + 1) - 0.5) * 1.1;
      this.smokeSpread[i] = 0.4 + hash01(i * 5 + 2) * 0.6;
      this.smokePhase[i] = hash01(i * 5 + 3);
    }

    if (ctx) {
      // Red halo bloom, unit radius.
      const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      bloom.addColorStop(0, "rgba(232,17,45,0.9)");
      bloom.addColorStop(0.4, "rgba(232,17,45,0.4)");
      bloom.addColorStop(1, "rgba(232,17,45,0)");
      this.bloomGrad = bloom;
      // White-hot core, unit radius.
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      core.addColorStop(0, "rgba(244,244,242,1)");
      core.addColorStop(0.5, "rgba(244,244,242,0.6)");
      core.addColorStop(1, "rgba(244,244,242,0)");
      this.coreGrad = core;
      // Soft smoke puff, unit radius (near-white, low alpha).
      const smoke = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      smoke.addColorStop(0, "rgba(244,244,242,0.2)");
      smoke.addColorStop(1, "rgba(244,244,242,0)");
      this.smokeGrad = smoke;
      // Directional light spill: horizontal, brightest at the origin edge,
      // raking rightward across the field then fading out by mid-frame.
      const spill = ctx.createLinearGradient(0, originY, w * 0.6, originY);
      spill.addColorStop(0, "rgba(244,244,242,0.5)");
      spill.addColorStop(0.12, "rgba(232,17,45,0.35)");
      spill.addColorStop(0.4, "rgba(232,17,45,0.1)");
      spill.addColorStop(1, "rgba(232,17,45,0)");
      this.spillGrad = spill;
      // Vignette: darkens the edges for a deliberate, finished frame.
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

      // Grain tile: seeded once into an offscreen canvas, tiled every frame.
      this.grainTile = this.buildGrain(ctx);
    }
    // originX is used at draw time; captured via ORIGIN_FX above.
    void originX;
    return Promise.resolve();
  }

  render(progress: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = clamp01(progress);
    const w = this.w;
    const h = this.h;
    const originX = w * ORIGIN_FX; // off-frame left.
    const originY = h * ORIGIN_FY;

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

    // Directional light spill raking in from the origin edge (not a fireball).
    if (bloom > 0.01 && this.spillGrad) {
      ctx.globalAlpha = clamp01(bloom * 0.9);
      ctx.fillStyle = this.spillGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Layered bloom anchored at the off-frame origin: red rim then hot white
    // core, so the brightness reads as spilling in from the left edge.
    if (bloom > 0.01 && this.bloomGrad && this.coreGrad) {
      const haloR = h * (0.4 + 0.9 * bloom);
      this.drawUnitGradient(ctx, this.bloomGrad, originX, originY, haloR, bloom);
      const coreR = h * (0.12 + 0.4 * bloom);
      this.drawUnitGradient(ctx, this.coreGrad, originX, originY, coreR, bloom);
    }

    // Smoke: soft puffs whose positions are FUNCTIONS of progress, drifting in
    // from the origin edge -- rising/spreading the further past the shot, then
    // thinning out.
    if (after > 0 && this.smokeGrad) {
      for (let i = 0; i < SMOKE_COUNT; i++) {
        const travel = after * (0.5 + this.smokePhase[i] * 0.5);
        const a = this.smokeAngle[i];
        const dist = w * 0.5 * travel * this.smokeSpread[i];
        const sx = originX + Math.cos(a) * dist;
        const sy = originY + Math.sin(a) * dist;
        const r = h * (0.1 + 0.32 * travel);
        const alpha = Math.sin(Math.PI * clamp01(travel)) * 0.85;
        this.drawUnitGradient(ctx, this.smokeGrad, sx, sy, r, alpha);
      }
    }

    // Casing: enters FROM the origin on a ballistic arc, tumbling, then falls.
    if (after > 0) {
      const s = after;
      // Travels rightward into the frame; arcs up then settles under gravity.
      const cx = originX + w * 0.42 * s;
      const cy = originY - h * 0.22 * Math.sin(Math.PI * s) + h * 0.12 * s * s;
      const spin = s * Math.PI * 6; // tumble.
      // Fades in as it clears the edge, fades slightly as it tumbles away.
      const enter = clamp01(s / 0.12);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = enter * clamp01(1 - s * 0.25);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      const cw = w * 0.012;
      const ch = h * 0.045;
      ctx.fillStyle = WHITE;
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.fillStyle = RED;
      ctx.fillRect(-cw / 2, ch / 2 - ch * 0.22, cw, ch * 0.22);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Vignette over everything (deliberate, finished frame).
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

  /** Build a seeded monochrome noise tile once and return a repeat pattern.
   * Returns null if offscreen canvas / pattern creation is unavailable. */
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
    this.smokeGrad = null;
    this.spillGrad = null;
    this.vignetteGrad = null;
    this.grainTile = null;
  }
}
