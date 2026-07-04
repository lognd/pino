// Pointer -> eased progress state machine -- docs/design/08-landing-hero.md.
// OBLIGATIONS this hook must satisfy (restated from doc 08, do not relax
// without updating that doc):
//   - Cursor x in [left edge, right edge] maps to target progress in
//     [0, 1]; displayed progress CHASES the target with critically-
//     damped smoothing (spring or exponential smoothing, ~200-350ms
//     settle) -- never snaps, never twitches on micro-jitter.
//   - Idle (no pointer movement for 3s, or touch devices with no hover):
//     progress drifts forward on its own at ~1/20 real speed, ping-
//     ponging forward/reverse. Any pointer movement blends back to
//     cursor control over ~500ms (no snap).
//   - Exactly ONE rAF loop lives here and nowhere else; both the source
//     and Wordmark.tsx read `progress` from this hook so they can never
//     desync (doc 08's "one interface, two sources" architecture).
//   - Low-power guard: if two consecutive seconds average < 30fps, the
//     caller (Hero.tsx) drops to the poster -- this hook should expose
//     enough (a running fps estimate) for that check.
//
// TODO(impl): docs/design/08-landing-hero.md

import type { RefObject } from "react";

export interface ScrubState {
  progress: number;
  isIdleDrifting: boolean;
}

export function useScrub(_containerRef: RefObject<HTMLElement>): ScrubState {
  throw new Error("TODO(impl): docs/design/08-landing-hero.md");
}
