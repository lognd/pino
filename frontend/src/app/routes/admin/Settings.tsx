// Settings (/admin/settings) -- docs/design/14-admin-mockup.md. Surfaces
// business identity as an editable field to prove it is configurable --
// still reads defaults from lib/brand.ts, never hardcodes the name.
//
// TODO(impl): docs/design/14-admin-mockup.md

import { businessShortName } from "../../../lib/brand";
import { SampleBanner } from "../../../components/SampleBanner";

export function AdminSettings() {
  return (
    <main>
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Settings
      </h1>
      {/* TODO(impl): docs/design/14-admin-mockup.md */}
      <p className="text-lg text-mp-muted">Business name: {businessShortName}</p>
    </main>
  );
}
