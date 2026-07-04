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
  });

  return (
    <main>
      <Suspense fallback={<HeroFallback />}>
        <Hero />
      </Suspense>

      {/* Real, screen-reader/SEO-visible H1 -- independent of the hero's
          decorative aria-hidden wordmark (doc 08's acceptance criteria). */}
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white px-4 pt-8">
        {businessShortName}
      </h1>
      <p className="mt-4 max-w-[70ch] px-4 text-lg text-mp-white">{CONTENT.hero.headline}</p>
      <p className="mt-2 max-w-[70ch] px-4 text-lg text-mp-white">{CONTENT.hero.subhead}</p>
      <div className="px-4 pt-6">
        <Link
          to="/book"
          className="inline-block min-h-[56px] w-full bg-mp-red px-6 py-4 text-xl font-bold uppercase text-mp-white hover:bg-mp-red-press sm:w-auto"
        >
          {CONTENT.hero.ctaLabel}
        </Link>
      </div>

      <section aria-labelledby="courses-heading" className="mt-16 px-4">
        <h2 id="courses-heading" className="font-display text-3xl font-extrabold italic uppercase text-mp-white">
          Courses
        </h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          {CONTENT.courses.map((course) => (
            <li key={course.slug} className="border-2 border-mp-border bg-mp-surface p-6">
              <h3 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
                {course.name}
              </h3>
              <p className="mt-2 text-lg text-mp-white">{course.shortDescription}</p>
              <p className="mt-2 text-lg font-semibold text-mp-white">{course.priceLabel}</p>
              <Link
                to={`/courses/${course.slug}`}
                className="mt-4 inline-block text-lg font-semibold text-mp-red underline"
              >
                Learn more about {course.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="credibility-heading" className="mt-16 px-4">
        <h2 id="credibility-heading" className="font-display text-3xl font-extrabold italic uppercase text-mp-white">
          {CONTENT.credibility.heading}
        </h2>
        <ul className="mt-6 max-w-[70ch] list-disc space-y-2 pl-6 text-lg text-mp-white">
          {CONTENT.credibility.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="cta-band-heading"
        className="mp-diagonal-divider mt-16 bg-mp-red px-4 py-16 text-center"
      >
        <h2 id="cta-band-heading" className="font-display text-3xl font-extrabold italic uppercase text-mp-white">
          {CONTENT.ctaBand.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-[60ch] text-xl font-bold text-mp-white">{CONTENT.ctaBand.body}</p>
        <div className="mt-6">
          <Link
            to="/book"
            className="inline-block min-h-[56px] w-full border-2 border-mp-white bg-mp-black-true px-6 py-4 text-xl font-bold uppercase text-mp-white sm:w-auto"
          >
            {CONTENT.ctaBand.ctaLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
