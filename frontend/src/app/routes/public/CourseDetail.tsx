// Single course detail -- docs/design/10-seo-and-content.md section 2.
//
// TODO(impl): docs/design/10-seo-and-content.md

import { useParams } from "react-router-dom";

export function CourseDetail() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Course: {slug}
      </h1>
      {/* TODO(impl): docs/design/10-seo-and-content.md */}
    </main>
  );
}
