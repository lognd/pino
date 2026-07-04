// Hero source selection -- docs/design/08-landing-hero.md's swap contract.
// Pure resolution of VITE_HERO_SOURCE (default "simulated") is separated
// from the dynamic import so the selection logic is unit-testable and the
// source modules stay in their own lazy chunks (keeps the hero chunk lean).

import type { ScrubSource } from "../timeline";

export type HeroSourceKind = "simulated" | "video";

/** Resolve a raw VITE_HERO_SOURCE value to a valid kind; anything other
 * than an exact "video" falls back to the default "simulated". */
export function resolveHeroSourceKind(raw: string | undefined): HeroSourceKind {
  return raw === "video" ? "video" : "simulated";
}

/** Lazily construct the selected source (code-split per kind). */
export async function createHeroSource(kind: HeroSourceKind): Promise<ScrubSource> {
  if (kind === "video") {
    const { VideoSource } = await import("./video");
    return new VideoSource();
  }
  const { SimulatedSource } = await import("./simulated");
  return new SimulatedSource();
}
