// /carousel-lab dev playground -- docs/design/15-media-and-gallery.md's
// "build 2-3 finished visual variants behind a `variant` prop; a dev-only
// /carousel-lab route (like /hero-lab) renders all variants with the SAMPLE
// media so a human picks." Route registration is App.tsx's job (dev-gated +
// lazy), same as HeroLab -- this file never enters the production bundle.
//
// Shows all three Carousel variants stacked, each with the full SAMPLE media
// (including the click-to-play video entry), so the chosen default can be
// compared side by side.

import { MEDIA } from "../content/media";
import { Carousel, type CarouselVariant } from "../components/Carousel";

const VARIANTS: { key: CarouselVariant; label: string; note: string }[] = [
  {
    key: "edge-peek",
    label: "edge-peek (SHIPPED DEFAULT)",
    note: "Neighbors peek at the frame edges -- communicates 'there is more' without dots.",
  },
  {
    key: "full-bleed",
    label: "full-bleed + counter chip",
    note: "One image edge-to-edge, overlaid skewed N-of-M chip, caption bar.",
  },
  {
    key: "filmstrip",
    label: "filmstrip rail",
    note: "Main stage plus a clickable thumbnail rail below.",
  },
];

export function CarouselLab() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Carousel Lab
      </h1>
      <p className="mt-2 text-lg text-mp-muted">
        Dev-only. All three variants with SAMPLE media -- pick one for Landing/Gallery.
      </p>
      {VARIANTS.map((v) => (
        <section key={v.key} className="mt-14">
          <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
            {v.label}
          </h2>
          <p className="mb-4 text-lg text-mp-muted">{v.note}</p>
          <Carousel items={MEDIA} variant={v.key} ariaLabel={`Carousel variant ${v.key}`} />
        </section>
      ))}
    </main>
  );
}
