// Hero composition + lazy init + degradation ladder --
// docs/design/08-landing-hero.md.
//
// Rungs (each required):
//   1. prefers-reduced-motion -> poster + static wordmark, no scrub loop.
//   2. before the source finishes init -> poster is what paints (rung 2's
//      no-JS prerender is the page's job; this covers the pre-init window).
//   3. touch/keyboard -> handled in useScrub (one-shot settle-through on
//      load, then rest; never hijacks touch scrolling).
//   4. low power (2 consecutive sub-30fps seconds) -> dispose + drop to
//      poster + one log line (via lib/logging.ts; its stub currently throws,
//      so the call is wrapped -- see TODO below).
//
// The visual region is aria-hidden decoration; the real <h1> business name
// lives on the Landing route (App.tsx), not here.

import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark, useWordmarkPointer, type WordmarkHandle } from "./Wordmark";
import { timeFlowScale, type ScrubMachineState } from "./scrubMachine";
import { useScrub } from "./useScrub";
import { prefersReducedMotion, isTouchDevice, isNarrowViewport } from "./env";
import type { ScrubSource } from "./timeline";
import { createHeroSource, resolveHeroSourceKind } from "./sources/select";
import { logDebug, logWarn } from "../lib/logging";

/** Sources may expose a quiescence probe (SimulatedSource does): true means
 * re-rendering the same progress repaints identical pixels, so idle frames
 * can be skipped entirely (zero canvas work while parked at rest). */
function isQuiescent(source: ScrubSource, progress: number): boolean {
  const probe = (source as { isQuiescent?: (p: number) => boolean }).isQuiescent;
  return typeof probe === "function" ? probe.call(source, progress) : false;
}

const POSTER_URL = "/brand/hero-poster.svg";
const MAX_DPR = 2;

/** Source init retry backoff (ms). A failed init is usually a transient
 * fetch/import hiccup (dev-server restart, flaky network) -- retry before
 * parking on the poster for good. */
const INIT_RETRY_DELAYS_MS = [1500, 6000];

type HeroMode = "poster" | "live";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const wordmarkHandle = useRef<WordmarkHandle>(null);
  const sourceRef = useRef<ScrubSource | null>(null);
  const [mode, setMode] = useState<HeroMode>("poster");
  const [posterBroken, setPosterBroken] = useState(false);
  const [reduced] = useState<boolean>(prefersReducedMotion);
  const [touch] = useState<boolean>(isTouchDevice);
  const [stacked] = useState<boolean>(isNarrowViewport);

  // Frame-accurate progress of the latest draw (for post-resize repaints).
  const progressRef = useRef(0);

  // Revision 5: all per-frame drawing happens HERE, off the rAF loop --
  // canvas render + imperative wordmark writes. No React state per frame.
  // Revision 7: the machine's SUPERHOT time flow scales the piece physics.
  const onFrame = useCallback(
    (progress: number, machine: Readonly<ScrubMachineState>): void => {
      progressRef.current = progress;
      const source = sourceRef.current;
      if (source && !isQuiescent(source, progress)) source.render(progress);
      wordmarkHandle.current?.setProgress(progress, timeFlowScale(machine));
    },
    [],
  );

  // Cursor-reactive pieces: pointer samples feed the wordmark physics.
  useWordmarkPointer(containerRef, wordmarkHandle);

  // Revision 4: the wordmark element feeds break-on-reach -- the pointer/touch
  // first entering its bounds fires the shot (useScrub raises the hit signal).
  const scrub = useScrub(containerRef, {
    enabled: mode === "live" && !reduced,
    touch,
    wordmarkRef,
    onFrame,
  });

  // Lazy source init behind requestIdleCallback so Landing LCP (the poster)
  // is never blocked by hero setup. Failure (e.g. the VideoSource stub)
  // leaves us parked on the poster.
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    let retryTimer = 0;
    const start = async (attempt = 0): Promise<void> => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cssW = container.clientWidth || 1280;
      const cssH = container.clientHeight || Math.round(cssW * 0.5);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      try {
        const kind = resolveHeroSourceKind(import.meta.env.VITE_HERO_SOURCE);
        const source = await createHeroSource(kind);
        await source.init(canvas);
        if (cancelled) {
          source.dispose();
          return;
        }
        sourceRef.current = source;
        source.render(0);
        setMode("live");
      } catch (err) {
        // Source unavailable (transient import/fetch failure, or the video
        // stub): log it -- a silent black hero cost a debugging session --
        // and retry with backoff before parking on the poster.
        const retrying = attempt < INIT_RETRY_DELAYS_MS.length;
        logWarn(
          `hero: source init failed (attempt ${attempt + 1}${retrying ? ", retrying" : ", staying on poster"})`,
          String(err),
        );
        if (!cancelled && retrying) {
          retryTimer = window.setTimeout(
            () => void start(attempt + 1),
            INIT_RETRY_DELAYS_MS[attempt],
          );
        }
      }
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId = 0;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => void start());
    } else {
      idleId = window.setTimeout(() => void start(), 1) as unknown as number;
    }

    // Container resizes (rotation, window drag): the canvas backing store was
    // sized once at init, so CSS would stretch it blurry. Re-size + re-init
    // the source (its gradients are built in device pixels) and repaint the
    // current frame. Coalesced through rAF; skipped when the size is stable.
    let resizeRaf = 0;
    const onResize = (): void => {
      if (resizeRaf) return;
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        const source = sourceRef.current;
        if (!source || cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const cssW = container.clientWidth || 1280;
        const cssH = container.clientHeight || Math.round(cssW * 0.5);
        const pxW = Math.round(cssW * dpr);
        const pxH = Math.round(cssH * dpr);
        if (pxW === canvas.width && pxH === canvas.height) return;
        canvas.width = pxW;
        canvas.height = pxH;
        logDebug("hero: canvas resized, reinitializing source", `${pxW}x${pxH}`);
        void source.init(canvas).then(() => {
          if (!cancelled) source.render(progressRef.current);
        });
      });
    };
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(container);

    return () => {
      cancelled = true;
      if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      if (retryTimer) window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      sourceRef.current?.dispose();
      sourceRef.current = null;
    };
  }, [reduced]);

  // Rung 4: low-power guard -> drop to poster + one log line.
  useEffect(() => {
    if (!scrub.lowPower || mode !== "live") return;
    sourceRef.current?.dispose();
    sourceRef.current = null;
    setMode("poster");
    try {
      // lib/logging.ts's logWarn is now implemented and no longer throws;
      // this try/catch is defensive-only and can be dropped in a future
      // cleanup pass (out of scope for the logging-stub fix itself).
      logWarn(
        "hero: dropped to poster after sustained low fps",
        `fps=${scrub.fps.toFixed(1)}`,
      );
    } catch {
      // logging not implemented yet; degradation still happened.
    }
  }, [scrub.lowPower, scrub.fps, mode]);

  const showLiveCanvas = mode === "live" && !reduced;

  return (
    <div
      ref={containerRef}
      // max-h caps the box on short/ultrawide viewports so the hero never
      // swallows the whole first screen; the ResizeObserver re-sizes the
      // canvas backing store to whatever box results. Taller aspect below
      // sm: the stacked two-row "MEL / PINO" mobile wordmark (Wordmark.tsx's
      // `stacked` prop) needs vertical room the wide 8/3 box doesn't give it.
      className="relative aspect-[3/4] max-h-[85svh] w-full overflow-hidden bg-mp-black-true sm:aspect-[8/3]"
      aria-hidden="true"
    >
      {/* Poster: the backdrop that paints first and the reduced-motion /
          low-power fallback. Hidden (not unmounted) once the canvas is
          live; hidden entirely if the asset fails, so a broken-image icon
          never shows (the always-on wordmark keeps the hero branded). */}
      <img
        src={POSTER_URL}
        alt=""
        role="presentation"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          visibility: showLiveCanvas ? "hidden" : "visible",
          display: posterBroken ? "none" : undefined,
        }}
        onError={() => {
          setPosterBroken(true);
          logWarn("hero: poster failed to load", POSTER_URL);
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ visibility: showLiveCanvas ? "visible" : "hidden" }}
      />
      {/* Rest-state ambience: CSS-only drifting haze (doc 08's "subtly
          alive" rule) -- zero JS, disabled under prefers-reduced-motion. */}
      {showLiveCanvas && (
        <div className="mp-hero-ambient pointer-events-none absolute inset-0" />
      )}
      {/* Wordmark overlay, ALWAYS mounted (doc 08 rung 1: "poster + static
          wordmark"): static lockup at progress 0 in poster mode, driven
          imperatively once live -- the hero stays branded even if the
          poster asset never arrives. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div ref={wordmarkRef} className={stacked ? "w-2/3 max-w-sm" : "w-3/4 max-w-3xl"}>
          <Wordmark ref={wordmarkHandle} stacked={stacked} className="w-full" />
        </div>
      </div>
    </div>
  );
}
