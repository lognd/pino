// VideoSource (ready, stubbed) -- docs/design/08-landing-hero.md.
// OBLIGATIONS for the future real clip:
//   - A preloaded muted <video>; render(p) sets
//     currentTime = p * duration (rVFC-synced draw to canvas, or direct
//     element scrub if seek latency allows).
//   - Spec for the eventual clip: 2-4s of 240fps, H.265/AV1 + H.264
//     fallback, keyframe-dense encode (-g 1 or near) because scrubbing
//     is random access; hosted via R2
//     (docs/design/13-storage-abstraction.md).
//   - Selected via VITE_HERO_SOURCE=video + VITE_HERO_VIDEO_URL; default
//     is "simulated" (see sources/simulated.ts).
//   - Must satisfy ScrubSource from ../timeline.ts exactly -- swapping
//     VITE_HERO_SOURCE must require ZERO changes outside hero/sources/.
//
// TODO(impl): docs/design/08-landing-hero.md

import type { ScrubSource } from "../timeline";

export class VideoSource implements ScrubSource {
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
