// Privacy/Terms/Disclaimers template -- existence and content requirements
// owned by docs/design/06-waivers-and-legal.md; wording is SAMPLE until
// Mel/counsel supply final text (see that doc's "Open questions"). One
// route per page (see App.tsx: /legal/privacy, /legal/terms,
// /legal/disclaimers) all render through this one template so the legal
// surface has a single home to update.

import { useParams } from "react-router-dom";
import { CONTENT } from "../../../content/mock";
import { BackHomeLink } from "../../../components/BackHomeLink";
import { usePageMeta } from "../../layout/PageMeta";

export function LegalPage() {
  const { page } = useParams<{ page: string }>();
  const entry = CONTENT.legalPages.find((p) => p.slug === page);
  const meta = entry ? CONTENT.meta.legal[entry.slug] : undefined;

  usePageMeta({
    title: meta?.title ?? "Page not found",
    description: meta?.description ?? "SAMPLE -- We could not find that page.",
    path: `/legal/${page ?? ""}`,
  });

  if (!entry) {
    return (
      <main className="px-4 py-12">
        <BackHomeLink className="mb-6" />
        <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
          We could not find that page
        </h1>
      </main>
    );
  }

  return (
    <main className="px-4 py-12">
      <BackHomeLink className="mb-6" />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {entry.title}
      </h1>
      <p className="mt-4 max-w-[70ch] border-2 border-mp-red-text px-4 py-3 text-lg font-semibold uppercase text-mp-red-text">
        {entry.sampleNotice}
      </p>
      <div className="mt-8 flex max-w-[70ch] flex-col gap-8">
        {entry.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
              {section.heading}
            </h2>
            <p className="mt-2 text-lg text-mp-white">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
