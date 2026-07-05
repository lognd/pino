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
// Sanctioned palette exception (doc 08 Revision 3): a single desaturated brass
// tone, permitted for the casing ONLY. Kept muted so the frame still reads
// black/white/red at a glance.
const BRASS = "#B08842";
const BRASS_DARK = "#7A5E2C";

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
  private rimGrad: CanvasGradient | null = null;
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
      // White-hot core, unit radius, with an INVERSE-SQUARE-ish falloff (stops
      // roughly following 1/(1+kr^2)) so brightness collapses fast off-centre
      // instead of the soft linear ramp that read as a cartoon starburst.
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(0.12, "rgba(248,246,240,0.82)");
      core.addColorStop(0.28, "rgba(244,244,242,0.42)");
      core.addColorStop(0.55, "rgba(244,244,242,0.12)");
      core.addColorStop(1, "rgba(244,244,242,0)");
      this.coreGrad = core;
      // One-beat red rim: a thin bright shell just outside the hot core.
      const rim = ctx.createRadialGradient(0, 0, 0.6, 0, 0, 1);
      rim.addColorStop(0, "rgba(232,17,45,0)");
      rim.addColorStop(0.72, "rgba(232,17,45,0.55)");
      rim.addColorStop(0.86, "rgba(255,120,140,0.5)");
      rim.addColorStop(1, "rgba(232,17,45,0)");
      this.rimGrad = rim;
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

    // Flash timeline (Revision 3): a short sliver of the timeline around
    // SHOT_MOMENT where exposure blows out, with a hot anamorphic core, a
    // one-beat red rim just after the peak, then instant decay into smoke +
    // lingering rim light. Three nested bumps of different widths.
    const bloom = Math.exp(-Math.pow((p - SHOT_MOMENT) / 0.10, 2)); // envelope
    const blowout = Math.exp(-Math.pow((p - SHOT_MOMENT) / 0.028, 2)); // sliver
    // Red rim beats ONE frame after the core peak (asymmetric, delayed).
    const rimBeat = Math.exp(-Math.pow((p - (SHOT_MOMENT + 0.045)) / 0.05, 2));
    // How far past the shot we are, in [0,1] (drives casing + smoke travel).
    const after = clamp01((p - SHOT_MOMENT) / (1 - SHOT_MOMENT));

    // Exposure blowout: the whole field lifts for a couple of frame-equivalents
    // (a bright wash), sold as over-exposure rather than a discrete fireball.
    if (blowout > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp01(blowout * 0.16);
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = "lighter";

    // Directional light spill raking in from the origin edge (not a fireball).
    if (bloom > 0.01 && this.spillGrad) {
      ctx.globalAlpha = clamp01(bloom * 0.9);
      ctx.fillStyle = this.spillGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Layered bloom anchored at the off-frame origin: red halo, an elongated
    // (anamorphic) hot core with inverse-square falloff, and a one-beat red rim
    // -- so the brightness reads as light spilling in from the left edge.
    if (bloom > 0.01 && this.bloomGrad && this.coreGrad) {
      const haloR = h * (0.4 + 0.9 * bloom);
      this.drawUnitGradient(ctx, this.bloomGrad, originX, originY, haloR, bloom * 0.85);
      // Anamorphic core: ~2.2x wider than tall (horizontal streak).
      const coreRy = h * (0.10 + 0.30 * blowout + 0.06 * bloom);
      this.drawAnamorphic(ctx, this.coreGrad, originX, originY, coreRy * 2.2, coreRy, blowout * 0.95 + bloom * 0.25);
      if (this.rimGrad && rimBeat > 0.02) {
        const rimR = h * (0.22 + 0.5 * bloom);
        this.drawAnamorphic(ctx, this.rimGrad, originX, originY, rimR * 1.8, rimR, rimBeat * 0.7);
      }
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

    // Casing (Revision 3): TINY, fast, and specular. A 9mm case is minuscule
    // against a viewport wordmark, so it errs small. It enters hot from the
    // origin, decelerates believably (position eases out -> fast start, gentle
    // settle), tumbles (foreshortened ellipse silhouette), carries a bright
    // specular glint line, and motion-stretches along its velocity when fast.
    if (after > 0) {
      // Ease-out travel: quick off the mark, decelerating -- a real ejection.
      const s = after;
      const decel = 1 - (1 - s) * (1 - s); // ease-out quad.
      const cx = originX + w * 0.34 * decel;
      const cy = originY - h * 0.16 * Math.sin(Math.PI * s) + h * 0.14 * s * s;
      const spin = s * Math.PI * 7; // tumble.
      // Instantaneous speed (derivative-ish) drives the motion-stretch.
      const speed = clamp01((1 - s) * 1.4);
      const enter = clamp01(s / 0.08);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = enter * clamp01(1 - s * 0.2);
      ctx.save();
      ctx.translate(cx, cy);
      // Orient stretch along velocity (roughly horizontal entry), then tumble.
      const stretch = 1 + speed * 1.6;
      ctx.rotate(spin);
      // Small brass capsule; height foreshortens with the tumble (ellipse
      // silhouette), width motion-stretches when moving fast.
      const cw = w * 0.009 * stretch;
      const ch = h * 0.03 * (0.35 + 0.65 * Math.abs(Math.cos(spin)));
      ctx.fillStyle = BRASS;
      ctx.beginPath();
      ctx.ellipse(0, 0, cw / 2, ch / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Darker base band (the case head) for a little form.
      ctx.fillStyle = BRASS_DARK;
      ctx.fillRect(-cw / 2, ch / 2 - ch * 0.28, cw, ch * 0.28);
      // Specular glint: a bright hairline down the lit side.
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = Math.max(0.6, cw * 0.12);
      ctx.globalAlpha *= 0.9;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.18, -ch * 0.4);
      ctx.lineTo(-cw * 0.18, ch * 0.3);
      ctx.stroke();
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

  /** Draw a unit-space radial gradient with independent x/y radii -- an
   * anamorphic (horizontally stretched) hot core, per Revision 3. */
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
    this.rimGrad = null;
    this.smokeGrad = null;
    this.spillGrad = null;
    this.vignetteGrad = null;
    this.grainTile = null;
  }
}
