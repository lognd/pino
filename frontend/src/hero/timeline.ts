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
 * the wordmark so they can never desync (see hero/useScrub.ts). */
export const SHOT_MOMENT = 0.35;
