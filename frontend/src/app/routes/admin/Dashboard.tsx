// Dashboard (/admin) -- docs/design/14-admin-mockup.md's route list.
//
// TODO(impl): docs/design/14-admin-mockup.md

import { SampleBanner } from "../../../components/SampleBanner";

export function AdminDashboard() {
  return (
    <main>
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Dashboard
      </h1>
      {/* TODO(impl): docs/design/14-admin-mockup.md */}
    </main>
  );
}
