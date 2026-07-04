// Pointer -> eased progress hook -- docs/design/08-landing-hero.md (Rev 2).
//
// This is a THIN rAF wrapper over the pure reducer in scrubMachine.ts:
// the hook owns the single rAF loop, the pointer listeners, and the React
// state; ALL timing/easing/settle-home/blend/touch/fps logic lives in `step`.
// Exactly one rAF loop exists here and nowhere else, so the source and the
// Wordmark can read one `progress` and never desync.
//
// Degradation wiring (Hero.tsx consumes these):
//   - `enabled: false` (reduced motion / poster fallback) => no loop,
//     progress parked at 0.
//   - touch pointers never scrub interactively and events are never
//     preventDefault'd, so the page never hijacks touch scrolling; with
//     `touch: true` the machine plays ONE slow 0->1 settle-through on load,
//     then rests (doc 08 rung 3 / Revision 2 touch rule).
//   - `lowPower` latches true after two consecutive sub-30fps seconds
//     (doc 08 rung 4) so Hero can drop to the poster.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  initialScrubState,
  step,
  DEFAULT_BAND_INSET,
  DEFAULT_SETTLE_MS,
} from "./scrubMachine";
import type { ScrubMachineState, ScrubMode } from "./scrubMachine";

export interface ScrubState {
  progress: number;
  /** True while the sequence is easing home / resting after idle. */
  isSettling: boolean;
  /** Current machine mode (surfaced for /hero-lab readouts). */
  mode: ScrubMode;
  /** Running fps estimate from the most recent completed 1s window. */
  fps: number;
  /** True once two consecutive seconds averaged < 30fps (latches). */
  lowPower: boolean;
}

export interface UseScrubOptions {
  /** When false, the loop never runs (reduced motion / poster fallback). */
  enabled?: boolean;
  /** Active-band inset per side (fraction of hero width). Tunable in the lab. */
  bandInset?: number;
  /** Settle-home duration in ms (doc 08: 4-6s). Tunable in the lab. */
  settleMs?: number;
  /** Touch device: play the one-shot settle-through, ignore the pointer. */
  touch?: boolean;
}

const PARKED: ScrubState = {
  progress: 0,
  isSettling: false,
  mode: "pointer",
  fps: 0,
  lowPower: false,
};

export function useScrub(
  containerRef: RefObject<HTMLElement>,
  options: UseScrubOptions = {},
): ScrubState {
  const enabled = options.enabled ?? true;
  const bandInset = options.bandInset ?? DEFAULT_BAND_INSET;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const touch = options.touch ?? false;
  const [state, setState] = useState<ScrubState>(PARKED);

  // Latest raw pointer x (mouse/pen), consumed once per frame. null means "no
  // movement this frame" -- that is what drives the idle timer.
  const pendingPointerX = useRef<number | null>(null);
  // Set on pointerleave; consumed once to force settle-home immediately.
  const pendingLeft = useRef<boolean>(false);
  const machine = useRef<ScrubMachineState>(initialScrubState());

  useEffect(() => {
    if (!enabled) {
      setState(PARKED);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    machine.current = initialScrubState({ bandInset, settleMs, touch });

    const onPointerMove = (e: PointerEvent): void => {
      // Rung 3: touch never scrubs (and we never preventDefault -> scroll is
      // never hijacked). Only hover-capable pointers drive control.
      if (touch || e.pointerType === "touch") return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      pendingPointerX.current = (e.clientX - rect.left) / rect.width;
    };
    const onPointerLeave = (): void => {
      // Pointer left the hero: settle home (Revision 2 idle rule).
      if (!touch) pendingLeft.current = true;
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dtMs = now - last;
      last = now;
      const pointerX = pendingPointerX.current;
      pendingPointerX.current = null;
      const pointerLeft = pendingLeft.current;
      pendingLeft.current = false;
      const nextMachine = step(machine.current, { pointerX, dtMs, pointerLeft });
      machine.current = nextMachine;
      setState({
        progress: nextMachine.progress,
        isSettling: nextMachine.mode === "settle",
        mode: nextMachine.mode,
        fps: nextMachine.fps,
        lowPower: nextMachine.belowThreshold,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [containerRef, enabled, bandInset, settleMs, touch]);

  return state;
}
