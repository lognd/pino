// /hero-lab dev playground -- docs/design/08-landing-hero.md.
//
// Self-contained (route registration is App.tsx's job, not this file). It
// drives a source + the reactive Wordmark directly so the scrub, the idle
// drift, the manual override, the source swap, and the fps guard can all be
// inspected in isolation. It intentionally does NOT reuse <Hero/>: the lab
// needs to reach inside the progress signal (override it, read fps) in a way
// the production component deliberately hides.

import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";
import { useScrub } from "./useScrub";
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

  const scrub = useScrub(containerRef, { enabled: !override });
  const progress = override ? manual : scrub.progress;

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

  // Redraw on every progress change (pointer, drift, or manual override).
  useEffect(() => {
    sourceRef.current?.render(progress);
  }, [progress]);

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
          <Wordmark progress={progress} className="hero-lab-wordmark" />
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
        <div>mode: {override ? "manual override" : scrub.isIdleDrifting ? "idle drift" : "pointer"}</div>
        <div>
          fps: {scrub.fps.toFixed(1)} {scrub.lowPower ? "(LOW POWER)" : ""}
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          source:
          <select
            value={sourceKind}
            onChange={(e) => setSourceKind(e.target.value as HeroSourceKind)}
          >
            <option value="simulated">simulated</option>
            <option value="video">video (stub)</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          manual progress override
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
      </div>
    </div>
  );
}
