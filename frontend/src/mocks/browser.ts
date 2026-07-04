// Sets up the MSW browser worker -- started from main.tsx only when
// VITE_USE_MOCKS=true (see docs/design/14-admin-mockup.md). Never runs in
// a normal production build. CRIB:
// logand.app/frontend/src/mocks/browser.ts (two lines, copy verbatim).

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
