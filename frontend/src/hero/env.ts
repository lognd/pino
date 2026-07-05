// Shared environment probes for the hero -- docs/design/08-landing-hero.md.
// One home for the media-query checks so Hero, useScrub wiring, and the
// bullethole feedback never keep divergent copies (NO DUPLICATION rule).

import { useEffect, useState } from "react";

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

const NARROW_VIEWPORT_QUERY = "(max-width: 639px)";

/** True below Tailwind's `sm` breakpoint (640px) -- drives the stacked
 * two-row "MEL / PINO" wordmark layout on mobile (docs/design/08's mobile
 * addendum). SSR-safe. A one-shot read; prefer useIsNarrowViewport in a
 * component so a resize/rotation actually re-renders. */
export function isNarrowViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(NARROW_VIEWPORT_QUERY).matches
  );
}

/** Live-updating version of isNarrowViewport() -- unlike
 * prefersReducedMotion/isTouchDevice (locked in once at mount elsewhere in
 * the hero, since neither realistically flips mid-session), a viewport
 * genuinely does cross the mobile/desktop breakpoint on window resize or
 * orientation change, and the stacked-vs-horizontal wordmark should track
 * that live rather than freezing whatever layout the page happened to load
 * under. */
export function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState<boolean>(isNarrowViewport);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches);
    mql.addEventListener("change", onChange);
    setNarrow(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
