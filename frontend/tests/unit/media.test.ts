import { describe, expect, it } from "vitest";
import {
  MEDIA,
  FEATURED_MEDIA,
  RANGE_STRIP_MEDIA,
  assertAllAltNonEmpty,
  formatCounter,
  MEDIA_COPY,
  type MediaItem,
} from "../../src/content/media";

// docs/design/15-media-and-gallery.md test obligations: manifest type guards
// (non-empty alt), plus the counter formatter the carousel's "N of M" uses.

describe("media manifest", () => {
  it("has a non-empty alt on every item (the a11y gate)", () => {
    expect(() => assertAllAltNonEmpty()).not.toThrow();
    for (const item of MEDIA) {
      expect(item.alt.trim().length).toBeGreaterThan(0);
    }
  });

  it("throws when any item has an empty/whitespace alt", () => {
    const bad: MediaItem[] = [
      { kind: "image", src: "/x.svg", thumb: "/x.svg", alt: "   ", aspect: "square" },
    ];
    expect(() => assertAllAltNonEmpty(bad)).toThrow(/empty alt/);
  });

  it("always provides a thumb for every item (video's only pre-click load)", () => {
    for (const item of MEDIA) {
      expect(item.thumb.length).toBeGreaterThan(0);
    }
  });

  it("includes at least one image and exactly one video entry", () => {
    expect(MEDIA.some((m) => m.kind === "image")).toBe(true);
    expect(MEDIA.filter((m) => m.kind === "video")).toHaveLength(1);
  });

  it("derives featured (4) and range-strip (3 images) subsets from MEDIA", () => {
    expect(FEATURED_MEDIA).toHaveLength(4);
    expect(RANGE_STRIP_MEDIA).toHaveLength(3);
    expect(RANGE_STRIP_MEDIA.every((m) => m.kind === "image")).toBe(true);
  });
});

describe("formatCounter", () => {
  it("fills the {current}/{total} template", () => {
    expect(formatCounter(MEDIA_COPY.carousel.counterTemplate, 1, 7)).toBe("1 of 7");
    expect(formatCounter(MEDIA_COPY.carousel.counterTemplate, 3, 7)).toBe("3 of 7");
  });
});
