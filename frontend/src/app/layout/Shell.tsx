// Page chrome: nav + footer, wraps every route. CRIB:
// logand.app/frontend/src/app/layout/Shell.tsx for the nav/useMe/logout
// pattern; melpino's nav is much simpler (no customer accounts, no
// admin-vs-guest nav split needed here -- the admin surface has its own
// gate below /admin).
//
// TODO(impl): docs/design/07-frontend-architecture.md

import type { ReactNode } from "react";
import { businessShortName } from "../../lib/brand";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-mp-black text-mp-white">
      <header className="border-b-2 border-mp-border px-4 py-4">
        {/* TODO(impl): docs/design/07-frontend-architecture.md -- real nav */}
        <span className="font-display text-2xl font-extrabold italic uppercase">
          {businessShortName}
        </span>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t-2 border-mp-border px-4 py-4 text-lg text-mp-muted">
        {/* TODO(impl): docs/design/07-frontend-architecture.md -- footer legal links */}
      </footer>
    </div>
  );
}
