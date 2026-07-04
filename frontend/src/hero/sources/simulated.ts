// SimulatedSource (v1) -- docs/design/08-landing-hero.md. OBLIGATIONS:
//   - Procedural canvas 2D rendering (WebGL only if 2D provably can't hit
//     budget) of a stylized firing sequence: black field; at SHOT_MOMENT
//     a red/white muzzle bloom (layered radial gradients + spark
//     streaks); a casing arc (parametric path, progress-indexed);
//     drifting smoke (a few pre-seeded soft particles whose positions
//     are FUNCTIONS of progress, not integrated per-frame -- this is the
//     purity rule from timeline.ts's ScrubSource.render doc comment).
//   - Stylized and graphic-novel-bold, not photoreal (matches doc 09's
//     black/red/white-only brand).
//   - All randomness seeded ONCE at init, never per-frame.
//   - Must satisfy ScrubSource from ../timeline.ts exactly.
//
// TODO(impl): docs/design/08-landing-hero.md

import type { ScrubSource } from "../timeline";

export class SimulatedSource implements ScrubSource {
  async init(_canvas: HTMLCanvasElement): Promise<void> {
    throw new Error("TODO(impl): docs/design/08-landing-hero.md");
  }

  render(_progress: number): void {
    throw new Error("TODO(impl): docs/design/08-landing-hero.md");
  }

  posterUrl(): string {
    throw new Error("TODO(impl): docs/design/08-landing-hero.md");
  }

  dispose(): void {
    throw new Error("TODO(impl): docs/design/08-landing-hero.md");
  }
}
