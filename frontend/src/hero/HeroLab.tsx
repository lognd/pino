// /hero-lab dev playground -- docs/design/08-landing-hero.md (Revision 2).
//
// Self-contained (route registration is App.tsx's job, not this file). It
// drives a source + the reactive Wordmark directly so the scrub, the settle-
// home drift, the manual override, the source swap, the fps guard, and the
// NEW Revision-2 tunables (active-band inset, settle duration, impact point)
// can all be inspected and tuned in isolation. It also hosts a bullet-hole
// test area. It intentionally does NOT reuse <Hero/>: the lab needs to reach
// inside the progress signal (override it, read fps) in a way the production
// component deliberately hides.

import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";
import { useScrub } from "./useScrub";
import { useBulletholeClicks } from "./useBulletholeClicks";
import { DEFAULT_BAND_INSET, DEFAULT_SETTLE_MS } from "./scrubMachine";
import { DEFAULT_IMPACT_FX, DEFAULT_IMPACT_FY } from "./shards";
import type { ScrubSource } from "./timeline";
import {
  createHeroSource,
  resolveHeroSourceKind,
  type HeroSourceKind,
} from "./sources/select";

export function HeroLab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ScrubSource | null>(null);

  const [sourceKind, setSourceKind] = useState<HeroSourceKind>(() =>
    resolveHeroSourceKind(import.meta.env.VITE_HERO_SOURCE),
  );
  const [override, setOverride] = useState(false);
  const [manual, setManual] = useState(0.35);
  const [status, setStatus] = useState("initializing");

  // Revision-2 tunables.
  const [bandInset, setBandInset] = useState(DEFAULT_BAND_INSET);
  const [settleMs, setSettleMs] = useState(DEFAULT_SETTLE_MS);
  const [impactFx, setImpactFx] = useState(DEFAULT_IMPACT_FX);
  const [impactFy, setImpactFy] = useState(DEFAULT_IMPACT_FY);

  const scrub = useScrub(containerRef, { enabled: !override, bandInset, settleMs });
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
  }, [sourceKind]);

  // Redraw on every progress change (pointer, settle, or manual override).
  useEffect(() => {
    sourceRef.current?.render(progress);
  }, [progress]);

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
          <Wordmark
            progress={progress}
            impactFx={impactFx}
            impactFy={impactFy}
            className="hero-lab-wordmark"
          />
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
        <div style={{ opacity: 0.7 }}>-- Revision 2 tunables --</div>

        <label style={row}>
          band inset (min 0.15):
          <input
            type="range"
            min={0.15}
            max={0.4}
            step={0.005}
            value={bandInset}
            onChange={(e) => setBandInset(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          {bandInset.toFixed(3)}
        </label>

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
