// Pointer -> activity-driven progress hook -- docs/design/08-landing-hero.md
// (Revision 4 model, Revision 5 render path).
//
// A THIN rAF wrapper over the pure reducer in scrubMachine.ts: the hook owns the
// single rAF loop, the pointer listeners, and the React state; ALL timing/
// energy/settle/break/touch/fps logic lives in `step`. Exactly one rAF loop
// exists here and nowhere else, so the source and the Wordmark read one
// `progress` and never desync.
//
// REVISION 5 (the "laggy" verdict): progress is NO LONGER published through
// React state every frame -- that re-rendered the whole hero tree at 60fps.
// The rAF loop hands each frame to `onFrame` (canvas render + imperative
// wordmark writes); the returned ScrubState only updates on mode/lowPower
// CHANGES plus a ~4Hz throttled readout (for /hero-lab), and not at all while
// parked at rest.
//
// Revision 4 wiring (unchanged): movement energy -> forward playback;
// `wordmarkHit` -> break-on-reach; never preventDefault, so touch scrolling is
// never hijacked.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { initialScrubState, step, DEFAULT_SETTLE_MS } from "./scrubMachine";
import type { ScrubMachineState, ScrubMode } from "./scrubMachine";

export interface ScrubState {
  /** Progress readout, throttled (~4Hz). Frame-accurate values go to onFrame. */
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
  /** Called every rAF tick with the frame-accurate progress; do the actual
   * drawing here (canvas render + wordmark handle), NOT off React state. */
  onFrame?: (progress: number, machine: Readonly<ScrubMachineState>) => void;
}

/** Minimum ms between throttled readout state updates. */
const READOUT_INTERVAL_MS = 250;

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

  // Latest onFrame without re-subscribing the whole loop on identity changes.
  const onFrameRef = useRef<UseScrubOptions["onFrame"]>(options.onFrame);
  onFrameRef.current = options.onFrame;

  // Movement accumulated since the last consumed frame (fraction of diagonal).
  const pendingMove = useRef<number>(0);
  // Raised once when the pointer/touch first enters the wordmark bounds.
  const pendingHit = useRef<boolean>(false);
  // Set on pointerleave; consumed once to force settle-home immediately.
  const pendingLeft = useRef<boolean>(false);
  // Raised once on the first pointerdown anywhere in the hero while in
  // touch mode -- kicks off the one-shot play-through on interaction
  // (rather than autoplaying on mount).
  const pendingInteractionStart = useRef<boolean>(false);
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
      // Touch never feeds energy -- there is no cursor, so "movement
      // energy" (the desktop SUPERHOT hook) doesn't have an equivalent
      // gesture on a touchscreen; touch instead plays a one-shot pass on
      // first interaction (see scrubMachine's touch mode below).
      // Hover-capable pointers accumulate movement into energy.
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
      // Any tap anywhere in the hero starts the touch one-shot pass.
      if (touch) pendingInteractionStart.current = true;
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
    // Readout throttling: publish to React state only when the mode/lowPower
    // flip (always) or the readout interval elapsed AND something changed.
    let lastReadoutMs = 0;
    let published = PARKED;
    const tick = (now: number): void => {
      const dtMs = now - last;
      last = now;
      const moveAmount = pendingMove.current;
      pendingMove.current = 0;
      const wordmarkHit = pendingHit.current;
      pendingHit.current = false;
      const pointerLeft = pendingLeft.current;
      pendingLeft.current = false;
      const interactionStart = pendingInteractionStart.current;
      pendingInteractionStart.current = false;
      const nextMachine = step(machine.current, {
        dtMs,
        moveAmount,
        wordmarkHit,
        pointerLeft,
        interactionStart,
      });
      machine.current = nextMachine;

      onFrameRef.current?.(nextMachine.progress, nextMachine);

      const modeChanged =
        nextMachine.mode !== published.mode ||
        nextMachine.belowThreshold !== published.lowPower;
      const readoutDue =
        now - lastReadoutMs >= READOUT_INTERVAL_MS &&
        (Math.abs(nextMachine.progress - published.progress) > 1e-4 ||
          Math.abs(nextMachine.energy - published.energy) > 1e-3 ||
          Math.abs(nextMachine.fps - published.fps) > 0.5);
      if (modeChanged || readoutDue) {
        lastReadoutMs = now;
        published = {
          progress: nextMachine.progress,
          isSettling: nextMachine.mode === "settle",
          mode: nextMachine.mode,
          energy: nextMachine.energy,
          fps: nextMachine.fps,
          lowPower: nextMachine.belowThreshold,
        };
        setState(published);
      }
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
