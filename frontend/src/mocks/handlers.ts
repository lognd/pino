// MSW v2 request handlers mirroring the real backend's future
// /api/admin/... surface -- docs/design/14-admin-mockup.md's
// "path-mirroring contract" (the important part): every handler MUST
// intercept the exact HTTP method and path the real backend will later
// serve, so graduating a screen from mockup to real means deleting its
// handler block here and nothing else. CRIB:
// logand.app/frontend/src/mocks/handlers.ts for the overall MSW v2
// setup and the sessionStorage-backed fake-role pattern (a plain module
// variable is wiped by any page reload; the real backend persists via an
// HttpOnly cookie, so sessionStorage is the closest mock-mode analog).
//
// Handlers are grouped by screen/resource, one comment-headed block per
// screen (per doc 14: "keep the handler file organized so one screen's
// handlers can be removed as a clean block"). Nothing is wired up yet --
// see TODO markers below, one per doc-14 screen.

import { http, HttpResponse } from "msw";

export const handlers = [
  // --- Dashboard (/admin) -----------------------------------------------
  // TODO(impl): GET /api/admin/dashboard -- docs/design/14-admin-mockup.md

  // --- Calendar / Schedule (/admin/schedule) -----------------------------
  // TODO(impl): GET /api/admin/sessions -- docs/design/14-admin-mockup.md
  // TODO(impl): POST /api/admin/sessions -- docs/design/14-admin-mockup.md

  // --- Session detail w/ roster (/admin/schedule/:sessionId) -------------
  // TODO(impl): GET /api/admin/sessions/:id -- docs/design/14-admin-mockup.md

  // --- Students (/admin/students) -----------------------------------------
  // TODO(impl): GET /api/admin/students -- docs/design/14-admin-mockup.md
  http.get("/api/admin/students", () => {
    return HttpResponse.json([]);
  }),

  // --- Invoices (/admin/invoices) ------------------------------------------
  // TODO(impl): GET /api/admin/invoices -- docs/design/14-admin-mockup.md

  // --- Record payment (/admin/invoices/:invoiceId/pay) ---------------------
  // TODO(impl): POST /api/admin/invoices/:id/payments -- docs/design/14-admin-mockup.md

  // --- Waivers (/admin/waivers) ---------------------------------------------
  // TODO(impl): GET /api/admin/waivers -- docs/design/14-admin-mockup.md

  // --- Settings (/admin/settings) --------------------------------------------
  // TODO(impl): GET /api/admin/settings -- docs/design/14-admin-mockup.md

  // --- Fake auth gate (docs/design/14-admin-mockup.md) -----------------------
  // TODO(impl): POST /api/auth/login, GET /api/auth/me
];
