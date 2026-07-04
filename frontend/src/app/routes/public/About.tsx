// Instructor bio/credentials -- docs/design/10-seo-and-content.md section 2.
//
// TODO(impl): docs/design/10-seo-and-content.md

import { CONTENT } from "../../../content/mock";

export function About() {
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {CONTENT.about.heading}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{CONTENT.about.bio}</p>
      {/* TODO(impl): docs/design/10-seo-and-content.md */}
    </main>
  );
}
