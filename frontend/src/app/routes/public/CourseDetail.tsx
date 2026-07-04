// Single course detail -- docs/design/10-seo-and-content.md section 2.
// 404-friendly: an unknown slug renders a plain "we can't find that class"
// message plus a link back to the catalog, rather than a blank/undefined
// crash -- doc 09's elderly-first bar applies to error states too.

import { Link, useParams } from "react-router-dom";
import { CONTENT } from "../../../content/mock";
import { usePageMeta } from "../../layout/PageMeta";
import { buildCourseJsonLd } from "../../../lib/jsonld";

export function CourseDetail() {
  const { slug } = useParams<{ slug: string }>();
  const course = CONTENT.courses.find((c) => c.slug === slug);

  usePageMeta({
    title: course ? `${course.name} -- Courses` : "Class not found",
    description: course ? course.shortDescription : "SAMPLE -- We could not find that class.",
    path: `/courses/${slug ?? ""}`,
    jsonLd: course ? buildCourseJsonLd(course) : undefined,
  });

  if (!course) {
    return (
      <main className="px-4 py-12">
        <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
          We could not find that class
        </h1>
        <p className="mt-4 max-w-[70ch] text-lg text-mp-white">
          SAMPLE -- That class link may be out of date. Take a look at our full class list.
        </p>
        <Link to="/courses" className="mt-6 inline-block text-lg font-semibold text-mp-red-text underline">
          See all courses
        </Link>
      </main>
    );
  }

  return (
    <main className="px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {course.name}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{course.longDescription}</p>
      <p className="mt-4 text-xl font-semibold text-mp-white">{course.priceLabel}</p>

      {course.kind === "law_cert" ? (
        <>
          <p className="mt-6 max-w-[70ch] text-lg text-mp-muted">{CONTENT.notices.eligibility}</p>
          <p className="mt-4 max-w-[70ch] text-lg text-mp-muted">{CONTENT.notices.trainingOutcome}</p>
        </>
      ) : null}
      {course.liveFire ? (
        <p className="mt-4 max-w-[70ch] text-lg text-mp-muted">{CONTENT.notices.assumptionOfRisk}</p>
      ) : null}

      <Link
        to="/book"
        className="mt-8 inline-block min-h-[56px] w-full bg-mp-red px-6 py-4 text-xl font-bold uppercase text-mp-white hover:bg-mp-red-press sm:w-auto"
      >
        Book a class
      </Link>
    </main>
  );
}
