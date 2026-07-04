// Contact page -- docs/design/10-seo-and-content.md section 2.
//
// TODO(impl): docs/design/10-seo-and-content.md

import { CONTENT } from "../../../content/mock";
import { PhoneFallbackNote } from "../../../components/PhoneFallbackNote";

export function Contact() {
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {CONTENT.contact.heading}
      </h1>
      {/* TODO(impl): docs/design/10-seo-and-content.md -- LocalBusiness JSON-LD */}
      <PhoneFallbackNote />
    </main>
  );
}
