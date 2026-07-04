// Landing page -- hero + course cards + credibility strip + primary CTA.
// See docs/design/08-landing-hero.md (hero) and
// docs/design/10-seo-and-content.md (IA/SEO).
//
// TODO(impl): docs/design/10-seo-and-content.md

import { businessShortName } from "../../../lib/brand";
import { CONTENT } from "../../../content/mock";
import { Hero } from "../../../hero/Hero";

export function Landing() {
  return (
    <main>
      <Hero />
      {/* Real, screen-reader/SEO-visible H1 -- independent of the hero's
          decorative aria-hidden wordmark (doc 08's acceptance criteria). */}
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {businessShortName}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{CONTENT.hero.headline}</p>
      {/* TODO(impl): docs/design/10-seo-and-content.md -- course cards,
          credibility strip, JSON-LD LocalBusiness structured data */}
    </main>
  );
}
