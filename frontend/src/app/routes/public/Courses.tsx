// Course catalog -- docs/design/10-seo-and-content.md section 2.

import { Link } from "react-router-dom";
import { CONTENT } from "../../../content/mock";
import { usePageMeta } from "../../layout/PageMeta";
import { buildCourseJsonLd } from "../../../lib/jsonld";

export function Courses() {
  usePageMeta({
    title: CONTENT.meta.courses.title,
    description: CONTENT.meta.courses.description,
    path: "/courses",
    jsonLd: CONTENT.courses.map(buildCourseJsonLd),
  });

  return (
    <main className="px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Courses
      </h1>
      <ul className="mt-8 grid gap-6 sm:grid-cols-3">
        {CONTENT.courses.map((course) => (
          <li key={course.slug} className="border-2 border-mp-border bg-mp-surface p-6">
            <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
              {course.name}
            </h2>
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
    </main>
  );
}
