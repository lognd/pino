// Hero composition + lazy init + degradation ladder --
// docs/design/08-landing-hero.md.
//
// Rungs (each required):
//   1. prefers-reduced-motion -> poster + static wordmark, no scrub loop.
//   2. before the source finishes init -> poster is what paints (rung 2's
//      no-JS prerender is the page's job; this covers the pre-init window).
//   3. touch/keyboard -> handled in useScrub (drift only, no scroll hijack).
//   4. low power (2 consecutive sub-30fps seconds) -> dispose + drop to
//      poster + one log line (via lib/logging.ts; its stub currently throws,
//      so the call is wrapped -- see TODO below).
//
// The visual region is aria-hidden decoration; the real <h1> business name
// lives on the Landing route (App.tsx), not here.

import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";
import { useScrub } from "./useScrub";
import type { ScrubSource } from "./timeline";
import { createHeroSource, resolveHeroSourceKind } from "./sources/select";
import { logWarn } from "../lib/logging";

const POSTER_URL = "/brand/hero-poster.svg";
const MAX_DPR = 2;

/** True when the user asked for reduced motion (SSR-safe). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type HeroMode = "poster" | "live";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ScrubSource | null>(null);
  const [mode, setMode] = useState<HeroMode>("poster");
  const [reduced] = useState<boolean>(prefersReducedMotion);

  const scrub = useScrub(containerRef, { enabled: mode === "live" && !reduced });

  // Lazy source init behind requestIdleCallback so Landing LCP (the poster)
  // is never blocked by hero setup. Failure (e.g. the VideoSource stub)
  // leaves us parked on the poster.
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    const start = async (): Promise<void> => {
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
      } catch {
        // Source unavailable (e.g. video stub) -- stay on the poster.
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

    return () => {
      cancelled = true;
      if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      sourceRef.current?.dispose();
      sourceRef.current = null;
    };
  }, [reduced]);

  // Draw the current frame whenever progress changes (source render is pure
  // in progress, so this is allocation-free after init).
  useEffect(() => {
    if (mode !== "live") return;
    sourceRef.current?.render(scrub.progress);
  }, [mode, scrub.progress]);

  // Rung 4: low-power guard -> drop to poster + one log line.
  useEffect(() => {
    if (!scrub.lowPower || mode !== "live") return;
    sourceRef.current?.dispose();
    sourceRef.current = null;
    setMode("poster");
    try {
      // lib/logging.ts is still a stub that throws; wrap until it lands.
      // TODO(impl): docs/design/07-frontend-architecture.md -- once
      // logWarn is real, this try/catch can be dropped.
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
      className="relative aspect-[8/3] w-full overflow-hidden bg-mp-black-true"
      aria-hidden="true"
    >
      {/* Poster: the frame that paints first and the reduced-motion / low-
          power fallback. Hidden (not unmounted) once the canvas is live. */}
      <img
        src={POSTER_URL}
        alt=""
        role="presentation"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ visibility: showLiveCanvas ? "hidden" : "visible" }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ visibility: showLiveCanvas ? "visible" : "hidden" }}
      />
      {/* Wordmark overlay: interactive when live, static (progress 0) on the
          poster. The poster art already contains a whole lockup, so we only
          overlay the live, fracturing wordmark. */}
      {showLiveCanvas && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Wordmark progress={scrub.progress} className="w-3/4 max-w-3xl" />
        </div>
      )}
    </div>
  );
}
