import { describe, it } from "vitest";

// docs/design/12-testing-strategy.md's frontend unit obligations: "scrub
// easing/idle state machine + shard purity (08)".
describe("hero/useScrub.ts", () => {
  it.todo("maps cursor position at the left/right edges to progress 0/1");
  it.todo("chases the target progress with critically-damped smoothing, no snap");
  it.todo("drifts forward at ~1/20 speed and ping-pongs after 3s idle");
  it.todo("blends pointer control back in over ~500ms after idle drift");
});

describe("hero/Wordmark.tsx shard transforms", () => {
  it.todo("produces identical shard transforms for the same progress value (purity)");
  it.todo("displacement is proportional to |progress - SHOT_MOMENT|");
  it.todo("reassembles to the pixel-perfect lockup at progress 0 and 1");
});
