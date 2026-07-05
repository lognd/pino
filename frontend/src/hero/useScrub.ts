// Pointer -> activity-driven progress hook -- docs/design/08-landing-hero.md
// (Revision 4).
//
// A THIN rAF wrapper over the pure reducer in scrubMachine.ts: the hook owns the
// single rAF loop, the pointer listeners, and the React state; ALL timing/
// energy/settle/break/touch/fps logic lives in `step`. Exactly one rAF loop
// exists here and nowhere else, so the source and the Wordmark read one
// `progress` and never desync.
//
// Revision 4 wiring: progress is no longer mapped to cursor X. This hook
//   - accumulates pointer MOVEMENT (distance moved / hero diagonal) per tick and
//     hands it to the machine as `moveAmount` (energy -> forward playback);
//   - detects the pointer FIRST entering the wordmark bounds (via `wordmarkRef`)
//     and raises `wordmarkHit` -> break-on-reach fires the shot;
//   - never preventDefault's, so touch scrolling is never hijacked.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { initialScrubState, step, DEFAULT_SETTLE_MS } from "./scrubMachine";
import type { ScrubMachineState, ScrubMode } from "./scrubMachine";

export interface ScrubState {
  progress: number;
  /** True while the sequence is easing home / resting after idle. */
  isSettling: boolean;
  /** Current machine mode (surfaced for /hero-lab readouts). */
  mode: ScrubMode;
  /** Smoothed movement energy (surfaced for /hero-lab readouts). */
  energy: number;
  /** Running fps estimate from the most recent completed 1s window. */
  fps: number;
  /** True once two consecutive seconds averaged < 30fps (latches). */
  lowPower: boolean;
}

export interface UseScrubOptions {
  /** When false, the loop never runs (reduced motion / poster fallback). */
  enabled?: boolean;
  /** Settle-home duration in ms (doc 08: 4-6s). Tunable in the lab. */
  settleMs?: number;
  /** Touch device: play the one-shot forward pass, ignore pointer energy. */
  touch?: boolean;
  /** The wordmark element; entering its bounds fires break-on-reach. */
  wordmarkRef?: RefObject<HTMLElement | null>;
}

const PARKED: ScrubState = {
  progress: 0,
  isSettling: false,
  mode: "active",
  energy: 0,
  fps: 0,
  lowPower: false,
};

export function useScrub(
  containerRef: RefObject<HTMLElement | null>,
  options: UseScrubOptions = {},
): ScrubState {
  const enabled = options.enabled ?? true;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const touch = options.touch ?? false;
  const wordmarkRef = options.wordmarkRef;
  const [state, setState] = useState<ScrubState>(PARKED);

  // Movement accumulated since the last consumed frame (fraction of diagonal).
  const pendingMove = useRef<number>(0);
  // Raised once when the pointer/touch first enters the wordmark bounds.
  const pendingHit = useRef<boolean>(false);
  // Set on pointerleave; consumed once to force settle-home immediately.
  const pendingLeft = useRef<boolean>(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const insideWordmark = useRef<boolean>(false);
  const machine = useRef<ScrubMachineState>(initialScrubState());

  useEffect(() => {
    if (!enabled) {
      setState(PARKED);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    machine.current = initialScrubState({ settleMs, touch });
    lastPointer.current = null;
    insideWordmark.current = false;

    const wordmarkHitTest = (clientX: number, clientY: number): boolean => {
      const wm = wordmarkRef?.current;
      if (!wm) return false;
      const r = wm.getBoundingClientRect();
      return (
        clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
      );
    };

    const onPointerMove = (e: PointerEvent): void => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const diag = Math.hypot(rect.width, rect.height);
      const prev = lastPointer.current;
      // Touch never feeds energy (rung 3: no interactive scrub, no scroll
      // hijack). Hover-capable pointers accumulate movement into energy.
      if (!touch && e.pointerType !== "touch" && prev) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        pendingMove.current += Math.hypot(dx, dy) / diag;
      }
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // Break-on-reach: raise a hit on the transition outside -> inside.
      const nowInside = wordmarkHitTest(e.clientX, e.clientY);
      if (nowInside && !insideWordmark.current) pendingHit.current = true;
      insideWordmark.current = nowInside;
    };
    const onPointerDown = (e: PointerEvent): void => {
      // Touch break-on-reach: a tap inside the wordmark fires the shot.
      if (wordmarkHitTest(e.clientX, e.clientY)) pendingHit.current = true;
    };
    const onPointerLeave = (): void => {
      lastPointer.current = null;
      insideWordmark.current = false;
      if (!touch) pendingLeft.current = true;
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerleave", onPointerLeave);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dtMs = now - last;
      last = now;
      const moveAmount = pendingMove.current;
      pendingMove.current = 0;
      const wordmarkHit = pendingHit.current;
      pendingHit.current = false;
      const pointerLeft = pendingLeft.current;
      pendingLeft.current = false;
      const nextMachine = step(machine.current, {
        dtMs,
        moveAmount,
        wordmarkHit,
        pointerLeft,
      });
      machine.current = nextMachine;
      setState({
        progress: nextMachine.progress,
        isSettling: nextMachine.mode === "settle",
        mode: nextMachine.mode,
        energy: nextMachine.energy,
        fps: nextMachine.fps,
        lowPower: nextMachine.belowThreshold,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [containerRef, enabled, settleMs, touch, wordmarkRef]);

  return state;
}
