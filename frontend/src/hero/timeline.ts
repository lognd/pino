// The hero's swap-contract interface -- docs/design/08-landing-hero.md,
// copied VERBATIM from that doc's fenced code block. This is the
// contract: SimulatedSource and VideoSource (sources/) both implement it,
// and Hero.tsx/useScrub.ts never know which one they're driving. Do not
// change this interface without updating doc 08 in the same change.

export interface ScrubSource {
  /** Prepare assets; resolve when frame 0 is displayable. */
  init(canvas: HTMLCanvasElement): Promise<void>;
  /** Render the frame for progress in [0, 1]. Must be pure w.r.t.
   *  progress: same value in, same pixels out (this is what makes
   *  reverse scrubbing free). */
  render(progress: number): void;
  /** Static poster for reduced-motion / pre-init / no-JS. */
  posterUrl(): string;
  dispose(): void;
}

/** progress value where the muzzle flash peaks -- doc 08's SHOT_MOMENT.
 * The wordmark's shatter displacement is proportional to
 * |progress - SHOT_MOMENT|; this constant is shared by the source and
 * the wordmark so they can never desync (see hero/useScrub.ts).
 * Revision 4: moved EARLIER (0.35 -> 0.2) so the lockup starts breaking the
 * instant the pointer reaches it (break-on-reach ramps just past this). */
export const SHOT_MOMENT = 0.2;

/** Half-width (gaussian sigma) of the flash in progress units. Revision 4:
 * the flash occupies a SHORTER span than before -- a single tight beat around
 * SHOT_MOMENT rather than a broad wash. Shared so the source's exposure lift
 * and the wordmark's origin-side rim highlight peak on the same beat. */
export const FLASH_SPAN = 0.05;

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Single-beat flash envelope in [0,1], peaking (1) at SHOT_MOMENT and decaying
 * smoothly to 0 on both sides (a gaussian -- C-infinity continuous, no hard
 * gate). Shared by the simulated source (exposure/bloom/rim) and the wordmark
 * (origin-facing shard rim highlight) so "light on the scene" is one signal.
 * Pure function of progress. */
export function flashEnvelope(progress: number): number {
  const d = (clamp01(progress) - SHOT_MOMENT) / FLASH_SPAN;
  return Math.exp(-d * d);
}

/** Wall-clock luminance rate clamp (WCAG 2.3.1 photosensitivity guard): a
 * flash's displayed brightness may not traverse the full [0,1] range faster
 * than FLASH_MIN_TRANSITION_MS, no matter how fast `progress` is scrubbed.
 * At most one full swing per this window -> no strobing under jittery input. */
export const FLASH_MIN_TRANSITION_MS = 150;

/** One rate-clamped luminance step: move `prev` toward `target` but no faster
 * than a full 0->1 swing per FLASH_MIN_TRANSITION_MS of wall-clock `dtMs`.
 * Pure and total (dtMs <= 0 => no movement). Unit-tested for the clamp math. */
export function clampLuminanceStep(prev: number, target: number, dtMs: number): number {
  const maxDelta = (Math.max(0, dtMs) / FLASH_MIN_TRANSITION_MS);
  const d = target - prev;
  if (d > maxDelta) return prev + maxDelta;
  if (d < -maxDelta) return prev - maxDelta;
  return target;
}

/** Progress below which a finished flash re-arms (a fresh engagement cycle). */
export const FLASH_REARM_PROGRESS = SHOT_MOMENT * 0.4;
/** A rising luminance counts as "the flash has displayed" past this fraction
 * of its own target (relative, so quieter variants still complete a cycle). */
const FLASH_PEAK_FRACTION = 0.7;
/** Once a displayed flash decays below this it is spent for the cycle. */
const FLASH_SPENT_LUMINANCE = 0.05;

/** Stateful WCAG 2.3.1 flash guard, stepped once per rendered frame.
 *
 * Guarantees, regardless of how progress is scrubbed:
 *   - displayed luminance never traverses [0,1] faster than
 *     FLASH_MIN_TRANSITION_MS of wall-clock time (clampLuminanceStep);
 *   - the FIRST traversal of the beat displays IN FULL (rise and decay --
 *     the old guard cut the flash off mid-rise, which is why the shot
 *     rendered black at its own peak);
 *   - after one complete display (rise past FLASH_PEAK_FRACTION of target,
 *     decay below FLASH_SPENT_LUMINANCE) the flash is suppressed until
 *     progress returns home below FLASH_REARM_PROGRESS -- oscillating
 *     around the beat cannot strobe.
 */
/** A lit flash frozen in place (progress stationary inside the beat) starts
 * decaying in wall-clock after this long -- muzzle light dies even if the
 * scrubbed frame does not move (photographic realism + no stuck white wash). */
const FLASH_HOLD_MS = 250;

export class FlashGuard {
  private luminance = 0;
  private armed = true;
  private peaked = false;
  private holdMs = 0;
  private lastProgress = -1;

  /** Advance one frame: `target` is the scene's raw flash luminance for this
   * progress, `dtMs` the wall-clock time since the previous step. Returns the
   * displayed (guarded) luminance. */
  step(target: number, progress: number, dtMs: number): number {
    if (progress < FLASH_REARM_PROGRESS) {
      this.armed = true;
      this.peaked = false;
    }
    const stationary = Math.abs(progress - this.lastProgress) < 1e-4;
    this.lastProgress = progress;
    if (this.peaked && stationary && this.luminance > FLASH_SPENT_LUMINANCE) {
      this.holdMs += Math.max(0, dtMs);
    } else {
      this.holdMs = 0;
    }
    let allowed = this.armed ? Math.max(0, target) : 0;
    if (this.holdMs > FLASH_HOLD_MS) allowed = 0; // frozen frame: light dies.
    this.luminance = clampLuminanceStep(this.luminance, allowed, dtMs);
    if (this.armed) {
      if (target > 0.1 && this.luminance >= target * FLASH_PEAK_FRACTION) {
        this.peaked = true;
      } else if (this.peaked && this.luminance < FLASH_SPENT_LUMINANCE) {
        this.armed = false;
      }
    }
    return this.luminance;
  }

  /** True when no decay is pending (rendering again would not change pixels). */
  settled(target: number): boolean {
    if (this.luminance > FLASH_SPENT_LUMINANCE && this.peaked) return false;
    const allowed = this.armed ? Math.max(0, target) : 0;
    return Math.abs(this.luminance - allowed) < 1e-4;
  }

  reset(): void {
    this.luminance = 0;
    this.armed = true;
    this.peaked = false;
    this.holdMs = 0;
    this.lastProgress = -1;
  }
}

/** How far progress must fall below its cycle high-water before the smoke
 * counts as "returning" (hysteresis against forward jitter). */
const SMOKE_RETURN_DELTA = 0.08;
/** Wall-clock ms for a full smoke fade (out on return, back in on re-arm). */
const SMOKE_FADE_MS = 600;

/** One-pass smoke guard (same idea as FlashGuard, gentler physics): smoke
 * belongs to the SHOT, so it drifts with the first forward pass, FADES OUT
 * in wall-clock the moment the sequence starts rewinding home (a rewind
 * would otherwise un-drift it -- fine for real slow-mo footage, wrong for
 * the simulated scene), stays out for the rest of the cycle, and re-arms
 * once progress returns home. Stateful by design, wall-clock rate-limited
 * so no scrub pattern can flicker it. */
export class SmokePass {
  private scale = 0;
  private highWater = 0;
  private spent = false;

  /** Advance one frame; returns the smoke intensity multiplier in [0,1]. */
  step(progress: number, dtMs: number): number {
    const p = clamp01(progress);
    if (p < FLASH_REARM_PROGRESS) {
      this.spent = false;
      this.highWater = p;
    }
    this.highWater = Math.max(this.highWater, p);
    if (p < this.highWater - SMOKE_RETURN_DELTA) this.spent = true;
    const target = this.spent ? 0 : 1;
    const maxStep = Math.max(0, dtMs) / SMOKE_FADE_MS;
    const d = target - this.scale;
    if (d > maxStep) this.scale += maxStep;
    else if (d < -maxStep) this.scale -= maxStep;
    else this.scale = target;
    return this.scale;
  }

  /** True when the fade is complete (re-rendering would not change pixels). */
  settled(): boolean {
    return this.scale === (this.spent ? 0 : 1);
  }

  reset(): void {
    this.scale = 0;
    this.highWater = 0;
    this.spent = false;
  }
}

// ---------------------------------------------------------------------------
// Off-frame origin (Revision 2). The shot comes from ONE consistent point
// just outside a single edge of the hero -- NO weapon is ever drawn. Every
// motivated element (directional light spill, ballistic casing, drifting
// smoke, and the wordmark impact point) references these so "something fired
// off-screen to the left, at barrel height" reads consistently. Fractions are
// of the hero field; ORIGIN_FX is negative == ~10% BEYOND the left edge.
// ---------------------------------------------------------------------------

/** Horizontal origin as a fraction of hero width; negative == off-frame left. */
export const ORIGIN_FX = -0.1;
/** Vertical origin ("barrel height") as a fraction of hero height. */
export const ORIGIN_FY = 0.52;
