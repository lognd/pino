// Waivers (/admin/waivers) -- docs/design/14-admin-mockup.md.
//
// TODO(impl): docs/design/14-admin-mockup.md

import { SampleBanner } from "../../../components/SampleBanner";

export function AdminWaivers() {
  return (
    <main>
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Waivers
      </h1>
      {/* TODO(impl): docs/design/14-admin-mockup.md */}
    </main>
  );
}
