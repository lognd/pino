// /hero-lab dev playground -- docs/design/08-landing-hero.md (Revision 4).
//
// Self-contained (route registration is App.tsx's job). It drives a source + the
// reactive Wordmark directly so the activity-driven scrub, the settle-home
// drift, the manual progress override, the source swap, the fps guard, the
// impact point, and -- Revision 4 -- the SELECTABLE FLASH VARIANTS can all be
// inspected and tuned in isolation. It also hosts the bullet-hole test area and
// wires the wordmark bounds for break-on-reach. It intentionally does NOT reuse
// <Hero/>: the lab reaches inside the progress signal (override it, read fps).

import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark, type WordmarkHandle } from "./Wordmark";
import { useScrub } from "./useScrub";
import { useBulletholeClicks } from "./useBulletholeClicks";
import { DEFAULT_SETTLE_MS } from "./scrubMachine";
import { DEFAULT_IMPACT_FX, DEFAULT_IMPACT_FY } from "./shards";
import { SHOT_MOMENT } from "./timeline";
import type { ScrubSource } from "./timeline";
import {
  createHeroSource,
  resolveHeroSourceKind,
  type HeroSourceKind,
} from "./sources/select";
import {
  FLASH_VARIANTS,
  DEFAULT_FLASH_VARIANT,
  type FlashVariant,
} from "./sources/simulated";

/** A source that also exposes the selectable flash variant (SimulatedSource). */
function hasVariant(s: ScrubSource): s is ScrubSource & {
  setVariant(v: FlashVariant): void;
} {
  return typeof (s as { setVariant?: unknown }).setVariant === "function";
}

export function HeroLab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const wordmarkHandle = useRef<WordmarkHandle>(null);
  const sourceRef = useRef<ScrubSource | null>(null);
  // Frame-accurate progress of the most recent draw (rAF or manual), for
  // repainting on variant swaps without waiting for the next frame.
  const progressRef = useRef(0);

  const [sourceKind, setSourceKind] = useState<HeroSourceKind>(() =>
    resolveHeroSourceKind(import.meta.env.VITE_HERO_SOURCE),
  );
  const [override, setOverride] = useState(false);
  const [manual, setManual] = useState(SHOT_MOMENT);
  const [status, setStatus] = useState("initializing");

  // Revision 4 tunables.
  const [settleMs, setSettleMs] = useState(DEFAULT_SETTLE_MS);
  const [impactFx, setImpactFx] = useState(DEFAULT_IMPACT_FX);
  const [impactFy, setImpactFy] = useState(DEFAULT_IMPACT_FY);
  const [variant, setVariant] = useState<FlashVariant>(DEFAULT_FLASH_VARIANT);

  // Revision 5: drawing happens per rAF frame here, not off React state.
  const onFrame = useCallback((p: number): void => {
    progressRef.current = p;
    sourceRef.current?.render(p);
    wordmarkHandle.current?.setProgress(p);
  }, []);

  const scrub = useScrub(containerRef, {
    enabled: !override,
    settleMs,
    wordmarkRef,
    onFrame,
  });
  const progress = override ? manual : scrub.progress;

  const bullets = useBulletholeClicks();

  // (Re)initialize the selected source whenever the kind changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    sourceRef.current?.dispose();
    sourceRef.current = null;
    setStatus(`loading ${sourceKind}`);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round((container.clientWidth || 960) * dpr);
    canvas.height = Math.round((container.clientHeight || 360) * dpr);

    void (async () => {
      try {
        const source = await createHeroSource(sourceKind);
        await source.init(canvas);
        if (cancelled) {
          source.dispose();
          return;
        }
        if (hasVariant(source)) source.setVariant(variant);
        sourceRef.current = source;
        source.render(0);
        setStatus(`live: ${sourceKind}`);
      } catch (err) {
        setStatus(`failed: ${sourceKind} (${(err as Error).message})`);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Variant is applied here on (re)load and separately below on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKind]);

  // Apply a flash-variant change to the live source and repaint immediately.
  useEffect(() => {
    const source = sourceRef.current;
    if (source && hasVariant(source)) {
      source.setVariant(variant);
      source.render(progressRef.current);
    }
  }, [variant]);

  // Manual override: drive the same imperative path the rAF loop uses. The
  // scrub loop is disabled under override, so a small local loop keeps the
  // Revision 6 shard float alive at a parked progress value.
  useEffect(() => {
    if (!override) return;
    progressRef.current = manual;
    sourceRef.current?.render(manual);
    let raf = 0;
    const loop = (): void => {
      wordmarkHandle.current?.setProgress(manual);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [override, manual]);

  const row = { display: "flex", gap: 8, alignItems: "center" } as const;

  return (
    <div style={{ background: "#0A0A0B", color: "#F4F4F2", padding: 24, minHeight: "100vh" }}>
      <h1 style={{ fontFamily: "sans-serif", fontStyle: "italic", fontWeight: 800 }}>
        HERO LAB
      </h1>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "8 / 3",
          background: "#000000",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div ref={wordmarkRef} style={{ width: "75%", maxWidth: 768 }}>
            <Wordmark
              ref={wordmarkHandle}
              impactFx={impactFx}
              impactFy={impactFy}
              className="hero-lab-wordmark"
            />
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          fontFamily: "monospace",
          fontSize: 16,
        }}
      >
        <div>status: {status}</div>
        <div>progress: {progress.toFixed(4)}</div>
        <div>
          mode: {override ? "manual override" : scrub.isSettling ? "settle-home" : scrub.mode}
        </div>
        <div>energy: {scrub.energy.toFixed(3)}</div>
        <div>
          fps: {scrub.fps.toFixed(1)} {scrub.lowPower ? "(LOW POWER)" : ""}
        </div>

        <label style={row}>
          source:
          <select
            value={sourceKind}
            onChange={(e) => setSourceKind(e.target.value as HeroSourceKind)}
          >
            <option value="simulated">simulated</option>
            <option value="video">video (stub)</option>
          </select>
        </label>

        <label style={row}>
          flash variant:
          <select value={variant} onChange={(e) => setVariant(e.target.value as FlashVariant)}>
            {FLASH_VARIANTS.map((v) => (
              <option key={v} value={v}>
                {v}
                {v === DEFAULT_FLASH_VARIANT ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label style={row}>
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          manual progress override
        </label>

        <label style={row}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={manual}
            disabled={!override}
            onChange={(e) => setManual(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          {manual.toFixed(3)}
        </label>

        <hr style={{ borderColor: "#333", width: "100%" }} />
        <div style={{ opacity: 0.7 }}>-- Revision 4 tunables --</div>

        <label style={row}>
          settle ms (4000-6000):
          <input
            type="range"
            min={4000}
            max={6000}
            step={100}
            value={settleMs}
            onChange={(e) => setSettleMs(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          {settleMs}
        </label>

        <label style={row}>
          impact x:
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={impactFx}
            onChange={(e) => setImpactFx(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          {impactFx.toFixed(3)}
        </label>

        <label style={row}>
          impact y:
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={impactFy}
            onChange={(e) => setImpactFy(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          {impactFy.toFixed(3)}
        </label>

        <hr style={{ borderColor: "#333", width: "100%" }} />
        <div style={{ opacity: 0.7 }}>-- bullet-hole test area --</div>
        <div style={row}>
          <button
            type="button"
            {...bullets.bulletProps}
            style={{
              padding: "10px 18px",
              background: "#E8112D",
              color: "#F4F4F2",
              border: "none",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            SHOOT ME
          </button>
          <a
            href="#"
            {...bullets.bulletProps}
            onClick={(e) => e.preventDefault()}
            style={{ color: "#F4F4F2" }}
          >
            or this link
          </a>
        </div>
      </div>
      {bullets.overlay}
    </div>
  );
}
