// Pointer -> eased progress hook -- docs/design/08-landing-hero.md.
//
// This is a THIN rAF wrapper over the pure reducer in scrubMachine.ts:
// the hook owns the single rAF loop, the pointer listener, and the React
// state; ALL timing/easing/idle-drift/blend/fps logic lives in `step`.
// Exactly one rAF loop exists here and nowhere else, so the source and the
// Wordmark can read one `progress` and never desync.
//
// Degradation wiring (Hero.tsx consumes these):
//   - `enabled: false` (reduced motion / poster fallback) => no loop,
//     progress parked at 0.
//   - touch pointers are IGNORED and events are never preventDefault'd, so
//     the page never hijacks touch scrolling; with no mouse/pen movement
//     the machine simply drifts (doc 08 rung 3).
//   - `lowPower` latches true after two consecutive sub-30fps seconds
//     (doc 08 rung 4) so Hero can drop to the poster.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { initialScrubState, step } from "./scrubMachine";
import type { ScrubMachineState } from "./scrubMachine";

export interface ScrubState {
  progress: number;
  isIdleDrifting: boolean;
  /** Running fps estimate from the most recent completed 1s window. */
  fps: number;
  /** True once two consecutive seconds averaged < 30fps (latches). */
  lowPower: boolean;
}

export interface UseScrubOptions {
  /** When false, the loop never runs (reduced motion / poster fallback). */
  enabled?: boolean;
}

const PARKED: ScrubState = {
  progress: 0,
  isIdleDrifting: false,
  fps: 0,
  lowPower: false,
};

export function useScrub(
  containerRef: RefObject<HTMLElement>,
  options: UseScrubOptions = {},
): ScrubState {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<ScrubState>(PARKED);

  // Latest normalized pointer x (mouse/pen), consumed once per frame. null
  // means "no movement this frame" -- that is what drives the idle timer.
  const pendingPointerX = useRef<number | null>(null);
  const machine = useRef<ScrubMachineState>(initialScrubState());

  useEffect(() => {
    if (!enabled) {
      setState(PARKED);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    machine.current = initialScrubState();

    const onPointerMove = (e: PointerEvent): void => {
      // Rung 3: touch never scrubs (and we never preventDefault -> scroll
      // is never hijacked). Only hover-capable pointers drive control.
      if (e.pointerType === "touch") return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      pendingPointerX.current = (e.clientX - rect.left) / rect.width;
    };
    el.addEventListener("pointermove", onPointerMove);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dtMs = now - last;
      last = now;
      const pointerX = pendingPointerX.current;
      pendingPointerX.current = null;
      const nextMachine = step(machine.current, { pointerX, dtMs });
      machine.current = nextMachine;
      setState({
        progress: nextMachine.progress,
        isIdleDrifting: nextMachine.mode === "drift",
        fps: nextMachine.fps,
        lowPower: nextMachine.belowThreshold,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onPointerMove);
    };
  }, [containerRef, enabled]);

  return state;
}
