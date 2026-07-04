// Privacy/Terms/Disclaimers -- existence and content owned by
// docs/design/06-waivers-and-legal.md; this route renders whichever page
// the :page param names.
//
// TODO(impl): docs/design/06-waivers-and-legal.md

import { useParams } from "react-router-dom";

export function Legal() {
  const { page } = useParams<{ page: string }>();
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Legal: {page}
      </h1>
      {/* TODO(impl): docs/design/06-waivers-and-legal.md */}
    </main>
  );
}
