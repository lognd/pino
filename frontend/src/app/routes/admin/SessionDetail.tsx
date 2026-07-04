// Session detail w/ roster (/admin/schedule/:sessionId) --
// docs/design/14-admin-mockup.md.
//
// TODO(impl): docs/design/14-admin-mockup.md

import { useParams } from "react-router-dom";
import { SampleBanner } from "../../../components/SampleBanner";

export function AdminSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return (
    <main>
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Session: {sessionId}
      </h1>
      {/* TODO(impl): docs/design/14-admin-mockup.md */}
    </main>
  );
}
