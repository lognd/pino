import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { globSync } from "node:fs";

// Regression for the intermittent broken-image hero/nav-logo bug: "--" is
// ILLEGAL inside XML comments, and <img> loads SVGs through the STRICT XML
// parser -- one em-dash-style comment corrupted both brand assets while
// inline SVG (lenient HTML parsing) kept working, so it only surfaced when
// the poster/logo actually painted. Also pins explicit width/height:
// viewBox-only SVGs have zero intrinsic size in <img> contexts (Chromium
// reports naturalWidth 0), which collapsed the w-auto nav logo to 0px.

const SVGS = globSync("public/**/*.svg", { cwd: join(__dirname, "../..") }).map((p) =>
  join(__dirname, "../..", p),
);

describe("public brand SVGs", () => {
  it("found the brand assets", () => {
    expect(SVGS.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of SVGS) {
    const name = relative(join(__dirname, "../.."), file);

    it(`${name} is strictly valid XML (no '--' inside comments)`, () => {
      const src = readFileSync(file, "utf8");
      const doc = new DOMParser().parseFromString(src, "image/svg+xml");
      const err = doc.querySelector("parsererror");
      expect(err?.textContent ?? "").toBe("");
      expect(doc.documentElement.tagName.toLowerCase()).toBe("svg");
    });

    it(`${name} declares explicit width/height (intrinsic size in <img>)`, () => {
      const src = readFileSync(file, "utf8");
      const doc = new DOMParser().parseFromString(src, "image/svg+xml");
      expect(doc.documentElement.getAttribute("width")).toBeTruthy();
      expect(doc.documentElement.getAttribute("height")).toBeTruthy();
    });
  }
});
