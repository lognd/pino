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
