// Gallery page (/gallery) -- docs/design/15-media-and-gallery.md's layout:
// a featured carousel (the chosen default variant) up top, then a hard-edged
// responsive grid of ALL manifest items with captions ALWAYS visible (never
// hover-only). Videos in the grid follow the click-to-play rule; images open
// in the minimal accessible lightbox. JSON-LD ImageGallery + prerender +
// sitemap registration live in lib/routes.ts / entry-server.tsx / this
// route's usePageMeta call.

import { useState } from "react";
import { CONTENT } from "../../../content/mock";
import { MEDIA, FEATURED_MEDIA, MEDIA_COPY } from "../../../content/media";
import type { MediaItem } from "../../../content/media";
import { usePageMeta } from "../../layout/PageMeta";
import { buildImageGalleryJsonLd } from "../../../lib/jsonld";
import { Carousel } from "../../../components/Carousel";
import { LazyMedia } from "../../../components/LazyMedia";
import { ClickToPlayVideo } from "../../../components/ClickToPlayVideo";
import { Lightbox } from "../../../components/Lightbox";

export function Gallery() {
  usePageMeta({
    title: CONTENT.meta.gallery.title,
    description: CONTENT.meta.gallery.description,
    path: "/gallery",
    jsonLd: buildImageGalleryJsonLd(MEDIA, CONTENT.meta.gallery.title),
  });

  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white sm:text-5xl">
        {MEDIA_COPY.gallery.heading}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{MEDIA_COPY.gallery.intro}</p>

      {/* Featured carousel -- edge-peek is the shipped default (see the
          /carousel-lab pick note in docs/design/15). */}
      <section aria-label={MEDIA_COPY.carousel.regionLabel} className="mt-10">
        <Carousel items={FEATURED_MEDIA} variant="edge-peek" />
      </section>

      {/* Hard-edged responsive grid of ALL items, captions under each tile
          (always visible, never hover-only -- doc 15). */}
      <section aria-labelledby="gallery-grid-heading" className="mt-16">
        <h2
          id="gallery-grid-heading"
          className="font-display text-3xl font-extrabold italic uppercase text-mp-white sm:text-4xl"
        >
          {MEDIA_COPY.gallery.gridHeading}
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MEDIA.map((item, i) => (
            <li key={`${item.src}-${i}`} className="flex flex-col">
              {item.kind === "video" ? (
                <ClickToPlayVideo item={item} />
              ) : (
                <button
                  type="button"
                  onClick={() => setLightboxItem(item)}
                  aria-label={`View photo: ${item.alt}`}
                  className="block w-full text-left"
                >
                  <LazyMedia src={item.thumb} alt={item.alt} aspect={item.aspect} />
                </button>
              )}
              {item.caption && <p className="mt-2 text-lg text-mp-white">{item.caption}</p>}
            </li>
          ))}
        </ul>
      </section>

      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}
    </main>
  );
}
