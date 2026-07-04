// Bullet-hole click feedback hook -- docs/design/08-landing-hero.md
// (Revision 2, NEW). Owns the lifecycle of the decorative hole overlay:
// spawn a hole at the pointerdown coordinates on opted-in elements, then
// auto-remove it after the fade. The effect is a portal overlay with
// pointer-events: none, so it NEVER intercepts events and NEVER delays the
// navigation/click underneath -- `bulletProps` neither preventDefault's nor
// stopPropagation's. Nothing spawns under prefers-reduced-motion.
//
// INTENDED INTEGRATION (done by the app layer, e.g. Shell / BigButton --
// hero/ stays standalone, so this is NOT wired here):
//
//   function Shell() {
//     const { overlay, bulletProps } = useBulletholeClicks();
//     return (
//       <>
//         <a href="/book" {...bulletProps}>Book</a>   {/* spread onto any CTA */}
//         {overlay}                                   {/* render once, near root */}
//       </>
//     );
//   }

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { BulletholeOverlay, HOLE_LIFETIME_MS } from "./Bullethole";
import type { Hole } from "./Bullethole";
import { prefersReducedMotion } from "./env";

export interface UseBulletholeClicks {
  /** Render this ONCE near the app root; it portals to document.body. */
  overlay: ReactNode;
  /** Spread onto any opted-in interactive element (nav link, CTA button). */
  bulletProps: { onPointerDown: (e: ReactPointerEvent) => void };
  /** Spawn a hole at explicit viewport coordinates (for tests / custom wiring). */
  spawn: (x: number, y: number) => void;
}

export function useBulletholeClicks(): UseBulletholeClicks {
  const [holes, setHoles] = useState<Hole[]>([]);
  const nextId = useRef(1);
  // Track pending removal timers so unmount cleans them up (no leaks/warnings).
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const spawn = useCallback((x: number, y: number): void => {
    // Purely decorative -- no effect at all under reduced motion.
    if (prefersReducedMotion()) return;
    const id = nextId.current++;
    // Seed the crack pattern from the click position (stable per hole).
    const seed = (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663) ^ id;
    setHoles((cur) => [...cur, { id, x, y, seed }]);
    const timer = setTimeout(() => {
      setHoles((cur) => cur.filter((h) => h.id !== id));
      timers.current.delete(timer);
    }, HOLE_LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent): void => {
      // Never preventDefault / stopPropagation: the click proceeds untouched.
      spawn(e.clientX, e.clientY);
    },
    [spawn],
  );

  return {
    overlay: createElement(BulletholeOverlay, { holes }),
    bulletProps: { onPointerDown },
    spawn,
  };
}
