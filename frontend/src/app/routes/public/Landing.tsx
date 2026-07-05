// Landing page -- hero + course cards + credibility strip + primary CTA.
// See docs/design/08-landing-hero.md (hero) and
// docs/design/10-seo-and-content.md (IA/SEO).
//
// The hero itself is owned by another agent (src/hero/**) and may be
// mid-flight; it is loaded via React.lazy behind a Suspense boundary so
// Landing's LCP and this route's typecheck never depend on its internals
// being finished. The fallback is a static black field + sr-only business
// name -- the same degradation baseline Hero.tsx documents for its own
// no-JS/reduced-motion rungs -- standing in for the poster until the hero
// module supplies one.

import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { businessShortName } from "../../../lib/brand";
import { CONTENT } from "../../../content/mock";
import { usePageMeta } from "../../layout/PageMeta";
import { buildLocalBusinessJsonLd } from "../../../lib/jsonld";
import { RANGE_STRIP_MEDIA, MEDIA_COPY } from "../../../content/media";
import { LazyMedia } from "../../../components/LazyMedia";

// Named export -> default via .then(), so this works whether or not
// src/hero/Hero.tsx ever grows a default export of its own.
const Hero = lazy(() =>
  import("../../../hero/Hero").then((mod) => ({ default: mod.Hero })),
);

function HeroFallback() {
  return (
    <div className="relative h-[60vh] min-h-[320px] bg-mp-black-true" aria-hidden="true">
      <span className="sr-only">{businessShortName}</span>
    </div>
  );
}

export function Landing() {
  usePageMeta({
    title: CONTENT.meta.landing.title,
    description: CONTENT.meta.landing.description,
    path: "/",
    jsonLd: buildLocalBusinessJsonLd(CONTENT.contact),
  });

  return (
    <main>
      <Suspense fallback={<HeroFallback />}>
        <Hero />
      </Suspense>

      {/* Intro block. Real, screen-reader/SEO-visible H1 -- independent of the
          hero's decorative aria-hidden wordmark (doc 08's acceptance criteria).
          Vertical rhythm uses one spacing scale (py-16 sm:py-20 per section,
          space-y-6 within), not ad-hoc margins (doc 09 polish pass). */}
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:py-20">
        <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white sm:text-5xl">
          {businessShortName}
        </h1>
        <p className="max-w-[70ch] text-lg text-mp-white">{CONTENT.hero.headline}</p>
        <p className="max-w-[70ch] text-lg text-mp-white">{CONTENT.hero.subhead}</p>
        <div>
          <Link
            to="/book"
            className="inline-block min-h-[56px] w-full bg-mp-red px-6 py-4 text-xl font-bold uppercase text-mp-white transition-colors hover:bg-mp-red-press sm:w-auto"
          >
            {CONTENT.hero.ctaLabel}
          </Link>
        </div>
      </section>

      {/* Diagonal divider (doc 09's single --mp-skew angle) framing the course
          band -- a deliberate hard-edged section break, not a soft gradient. */}
      <section
        aria-labelledby="courses-heading"
        className="mp-diagonal-divider border-y-2 border-mp-border bg-mp-black-true py-16 sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-4">
          <h2
            id="courses-heading"
            className="font-display text-3xl font-extrabold italic uppercase text-mp-white sm:text-4xl"
          >
            Courses
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {CONTENT.courses.map((course) => (
              <li
                key={course.slug}
                className="flex flex-col border-2 border-mp-border bg-mp-surface p-6 transition-[border-color,box-shadow] hover:border-mp-red hover:shadow-[6px_6px_0_0_var(--mp-black-true)] focus-within:border-mp-red focus-within:shadow-[6px_6px_0_0_var(--mp-black-true)]"
              >
                {/* Hierarchy: title / plain-words meta / price / one CTA. */}
                <h3 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
                  {course.name}
                </h3>
                <p className="mt-3 text-lg text-mp-white">{course.shortDescription}</p>
                <p className="mt-4 font-display text-2xl font-extrabold italic text-mp-white">
                  {course.priceLabel}
                </p>
                <Link
                  to={`/courses/${course.slug}`}
                  className="mt-6 inline-block text-lg font-semibold text-mp-red-text underline underline-offset-4"
                >
                  Learn more about {course.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Credibility strip -- designed as a row of hard-edged stat blocks with
          a red key-line, not a bare bulleted list (doc 09). */}
      <section aria-labelledby="credibility-heading" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2
          id="credibility-heading"
          className="font-display text-3xl font-extrabold italic uppercase text-mp-white sm:text-4xl"
        >
          {CONTENT.credibility.heading}
        </h2>
        <ul className="mt-8 grid gap-px border-2 border-mp-border bg-mp-border sm:grid-cols-2">
          {CONTENT.credibility.items.map((item) => (
            <li key={item} className="flex items-start gap-4 bg-mp-surface p-6">
              <span aria-hidden="true" className="mt-1 h-6 w-1.5 shrink-0 bg-mp-red" />
              <span className="text-lg text-mp-white">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* "From the range" strip -- a small additive teaser (3 images) linking
          to the full gallery (doc 15). Images only, so Landing never mounts a
          player; each is a layout-stable LazyMedia box. */}
      <section aria-labelledby="range-strip-heading" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2
          id="range-strip-heading"
          className="font-display text-3xl font-extrabold italic uppercase text-mp-white sm:text-4xl"
        >
          {MEDIA_COPY.landingStrip.heading}
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {RANGE_STRIP_MEDIA.map((item, i) => (
            <li key={`${item.src}-${i}`} className="flex flex-col">
              <LazyMedia src={item.thumb} alt={item.alt} aspect={item.aspect} />
              {item.caption && <p className="mt-2 text-lg text-mp-white">{item.caption}</p>}
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Link
            to="/gallery"
            className="inline-block text-lg font-semibold text-mp-red-text underline underline-offset-4"
          >
            {MEDIA_COPY.landingStrip.linkLabel}
          </Link>
        </div>
      </section>

      {/* Full-bleed red CTA band with the same diagonal cut. Secondary-styled
          button (white outline on black) so this is not a second competing red
          primary against the intro CTA. */}
      <section
        aria-labelledby="cta-band-heading"
        className="mp-diagonal-divider bg-mp-red py-16 text-center sm:py-20"
      >
        <div className="mx-auto max-w-6xl space-y-6 px-4">
          <h2
            id="cta-band-heading"
            className="font-display text-3xl font-extrabold italic uppercase text-mp-white sm:text-4xl"
          >
            {CONTENT.ctaBand.heading}
          </h2>
          <p className="mx-auto max-w-[60ch] text-xl font-bold text-mp-white">{CONTENT.ctaBand.body}</p>
          <div>
            <Link
              to="/book"
              className="inline-block min-h-[56px] w-full border-2 border-mp-white bg-mp-black-true px-6 py-4 text-xl font-bold uppercase text-mp-white transition-colors hover:bg-mp-surface sm:w-auto"
            >
              {CONTENT.ctaBand.ctaLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
