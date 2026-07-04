import { describe, it, expect } from "vitest";
import { resolveHeroSourceKind } from "../../src/hero/sources/select";

// docs/design/08-landing-hero.md swap contract: VITE_HERO_SOURCE selects
// the source, defaulting to "simulated" for anything but an exact "video".
describe("hero/sources/select.ts resolveHeroSourceKind", () => {
  it("selects video only for the exact 'video' value", () => {
    expect(resolveHeroSourceKind("video")).toBe("video");
  });

  it("defaults to simulated for unset, empty, or unknown values", () => {
    expect(resolveHeroSourceKind(undefined)).toBe("simulated");
    expect(resolveHeroSourceKind("")).toBe("simulated");
    expect(resolveHeroSourceKind("simulated")).toBe("simulated");
    expect(resolveHeroSourceKind("VIDEO")).toBe("simulated");
    expect(resolveHeroSourceKind("webgl")).toBe("simulated");
  });
});
