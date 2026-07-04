// Contact page -- docs/design/10-seo-and-content.md section 2. No form at
// v1 -- calling is the fallback culture per doc 04/09; phone and email are
// huge tappable links, not plain text.

import { CONTENT } from "../../../content/mock";
import { usePageMeta } from "../../layout/PageMeta";
import { buildLocalBusinessJsonLd } from "../../../lib/jsonld";

export function Contact() {
  usePageMeta({
    title: CONTENT.meta.contact.title,
    description: CONTENT.meta.contact.description,
    path: "/contact",
    jsonLd: buildLocalBusinessJsonLd(CONTENT.contact),
  });

  return (
    <main className="px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {CONTENT.contact.heading}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{CONTENT.contact.intro}</p>

      <div className="mt-8 flex flex-col gap-4">
        <a
          href={`tel:${CONTENT.contact.phone}`}
          className="inline-block min-h-[56px] w-full bg-mp-red px-6 py-4 text-center text-2xl font-bold uppercase text-mp-white hover:bg-mp-red-press sm:w-auto"
        >
          Call {CONTENT.contact.phone}
        </a>
        <a
          href={`mailto:${CONTENT.contact.email}`}
          className="inline-block min-h-[56px] w-full border-2 border-mp-white px-6 py-4 text-center text-2xl font-bold uppercase text-mp-white hover:bg-mp-surface sm:w-auto"
        >
          Email {CONTENT.contact.email}
        </a>
      </div>

      <p className="mt-8 text-lg text-mp-muted">{CONTENT.contact.address}</p>
    </main>
  );
}
