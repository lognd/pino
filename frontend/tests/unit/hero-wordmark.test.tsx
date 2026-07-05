import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Wordmark } from "../../src/hero/Wordmark";
import { SHOT_MOMENT } from "../../src/hero/timeline";

// docs/design/08-landing-hero.md (Revision 4) seam-leak regression: no shard
// boundary may be visible at rest. The fix renders the WHOLE unsplit lockup at
// shatter == 0 and mounts the clipped shard layer ONLY once separation begins.
// These assert the shard layer's presence/absence across the shatter envelope.

/** Count the shard clipPaths mounted (the shard layer is defs + clipped groups). */
function shardClipCount(container: HTMLElement): number {
  return container.querySelectorAll("clipPath[id^='mp-shard-']").length;
}

describe("hero/Wordmark.tsx seam fix (Revision 4)", () => {
  it("does NOT mount the shard layer at rest (progress 0) -- no seams", () => {
    const { container } = render(<Wordmark progress={0} />);
    expect(shardClipCount(container)).toBe(0);
    // The whole lockup text is still present for the render.
    expect(container.textContent).toContain("MEL");
    expect(container.textContent).toContain("PINO");
  });

  it("does NOT mount the shard layer anywhere at or below SHOT_MOMENT", () => {
    const { container } = render(<Wordmark progress={SHOT_MOMENT} />);
    expect(shardClipCount(container)).toBe(0);
  });

  it("mounts the shard layer once separation begins (progress past SHOT_MOMENT)", () => {
    const { container } = render(<Wordmark progress={0.9} />);
    expect(shardClipCount(container)).toBeGreaterThan(0);
  });

  it("renders no stroked crack-line overlay (removed in Revision 4)", () => {
    // The old build drew a <polyline> hairline crack network; it is gone. The
    // only strokes that may appear are the origin rim highlight (a <polygon>).
    const { container } = render(<Wordmark progress={0.6} />);
    expect(container.querySelectorAll("polyline").length).toBe(0);
  });
});
