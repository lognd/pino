// Instructor bio/credentials -- docs/design/10-seo-and-content.md section 2.
// Copy is SAMPLE until Mel supplies a real bio (see that doc's Open
// questions).

import { CONTENT } from "../../../content/mock";
import { usePageMeta } from "../../layout/PageMeta";

export function About() {
  usePageMeta({
    title: CONTENT.meta.about.title,
    description: CONTENT.meta.about.description,
    path: "/about",
  });

  return (
    <main className="px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {CONTENT.about.heading}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{CONTENT.about.bio}</p>
      <h2 className="mt-10 font-display text-2xl font-extrabold italic uppercase text-mp-white">
        Credentials
      </h2>
      <ul className="mt-4 max-w-[70ch] list-disc space-y-2 pl-6 text-lg text-mp-white">
        {CONTENT.about.credentials.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </main>
  );
}
