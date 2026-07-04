// Shared environment probes for the hero -- docs/design/08-landing-hero.md.
// One home for the media-query checks so Hero, useScrub wiring, and the
// bullethole feedback never keep divergent copies (NO DUPLICATION rule).

/** True when the user asked for reduced motion (SSR-safe). Under this the
 * hero renders the poster only, and the bullethole effect never spawns. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** True on hover-less (touch) devices. Drives the one-shot settle-through and
 * keeps interactive scrubbing off touch (doc 08 rung 3). SSR-safe. */
export function isTouchDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none)").matches
  );
}
