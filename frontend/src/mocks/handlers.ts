// MSW v2 request handlers mirroring the real backend's future
// /api/admin/... surface -- docs/design/14-admin-mockup.md's
// "path-mirroring contract" (the important part): every handler MUST
// intercept the exact HTTP method and path the real backend will later
// serve, so graduating a screen from mockup to real means deleting its
// handler block here and nothing else.
//
// Handlers are grouped by screen/resource, one comment-headed block per
// screen (per doc 14: "keep the handler file organized so one screen's
// handlers can be removed as a clean block"). Mutations write through to
// the in-memory arrays in ./data so the mockup feels alive for the tab
// session; a reload resets everything (desirable per doc 14).
//
// Auth (/api/auth/login, /api/auth/me, /api/auth/logout) has graduated
// per docs/design/14's checklist: the real backend (api/auth.py,
// domain/auth/service.py) is fully implemented against
// docs/design/02-auth-and-security.md. In plain `npm run dev`
// (VITE_USE_MOCKS unset/false) MSW still auto-starts for every /admin
// route (main.tsx's `import.meta.env.DEV` gate, needed so the still-mocked
// screens below work without a flag), but auth itself now bypasses to the
// real backend so real admin credentials actually work -- see
// AdminGuard.tsx / Login.tsx, which call the same client either way.
//
// The explicit `VITE_USE_MOCKS=true` build (npm run dev:mock, and the
// dist-mock/ build the Playwright "admin" system-test project serves,
// see tests/system/admin-mockup.spec.ts) has NO live backend at all, so
// auth there keeps the original fake sessionStorage gate (any email +
// MOCK_LOGIN_PASSWORD).

import { bypass, http, HttpResponse } from "msw";
import {
  bookings,
  courses,
  invoices,
  sessions,
  settings,
  students,
  waitlistEntries,
  waivers,
  type MockPayment,
} from "./data";

const useRealAuth = import.meta.env.VITE_USE_MOCKS !== "true";

export const MOCK_AUTH_SESSION_KEY = "mp_admin_mock_authed";
export const MOCK_LOGIN_PASSWORD = "letmein";

function isMockAuthed(): boolean {
  return sessionStorage.getItem(MOCK_AUTH_SESSION_KEY) === "true";
}

function courseFor(sessionRow: (typeof sessions)[number]) {
  return courses.find((c) => c.id === sessionRow.course_id) ?? null;
}

function rosterFor(sessionId: string) {
  return bookings
    .filter((b) => b.session_id === sessionId && b.status !== "cancelled")
    .map((b) => ({ ...b, student: students.find((s) => s.id === b.student_id) ?? null }));
}

function waitlistFor(sessionId: string) {
  return waitlistEntries
    .filter((w) => w.session_id === sessionId)
    .map((w) => ({ ...w, student: students.find((s) => s.id === w.student_id) ?? null }));
}

export const handlers = [
  // --- Auth (see note above: real backend outside VITE_USE_MOCKS=true) ---
  ...(useRealAuth
    ? [
        http.post("/api/auth/login", ({ request }) => fetch(bypass(request))),
        http.post("/api/auth/logout", ({ request }) => fetch(bypass(request))),
        http.get("/api/auth/me", ({ request }) => fetch(bypass(request))),
      ]
    : [
        http.post("/api/auth/login", async ({ request }) => {
          const body = (await request.json()) as { email?: string; password?: string };
          if (!body.email || body.password !== MOCK_LOGIN_PASSWORD) {
            return HttpResponse.json({ code: "invalid_credentials", message: "Invalid email or password" }, { status: 401 });
          }
          sessionStorage.setItem(MOCK_AUTH_SESSION_KEY, "true");
          return HttpResponse.json({ status: "ok" });
        }),
        http.post("/api/auth/logout", () => {
          sessionStorage.removeItem(MOCK_AUTH_SESSION_KEY);
          return HttpResponse.json({ status: "ok" });
        }),
        http.get("/api/auth/me", () => {
          if (!isMockAuthed()) {
            return HttpResponse.json({ code: "unauthenticated", message: "Not logged in" }, { status: 401 });
          }
          return HttpResponse.json({ user_id: "mock-admin-1", role: "admin" });
        }),
      ]),

  // --- Dashboard (/admin) -------------------------------------------------
  // Real endpoint: GET /api/admin/dashboard
  http.get("/api/admin/dashboard", () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const upcoming = sessions
      .filter((s) => new Date(s.starts_at) >= now && s.status !== "cancelled")
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 5)
      .map((s) => ({
        ...s,
        course: courseFor(s),
        seats_filled: rosterFor(s.id).reduce((sum, b) => sum + b.party_size, 0),
      }));
    const unpaid_invoice_count = invoices.filter((i) => i.status !== "paid").length;
    return HttpResponse.json({ upcoming_sessions: upcoming, unpaid_invoice_count });
  }),

  // --- Calendar / Schedule (/admin/schedule) ------------------------------
  // Real endpoints: GET /api/admin/sessions, POST /api/admin/sessions
  http.get("/api/admin/sessions", () => {
    const withCourse = sessions.map((s) => ({
      ...s,
      course: courseFor(s),
      seats_filled: rosterFor(s.id).reduce((sum, b) => sum + b.party_size, 0),
    }));
    return HttpResponse.json(withCourse);
  }),

  http.post("/api/admin/sessions", async ({ request }) => {
    const body = (await request.json()) as Partial<(typeof sessions)[number]>;
    const created = {
      id: `session-${sessions.length + 1}`,
      course_id: body.course_id ?? courses[0].id,
      starts_at: body.starts_at ?? new Date().toISOString(),
      ends_at: body.ends_at ?? new Date().toISOString(),
      location_name: body.location_name ?? "SAMPLE Range, Clearwater",
      location_addr: body.location_addr ?? "",
      capacity: body.capacity ?? 12,
      status: "draft" as const,
      notes: body.notes ?? "",
    };
    sessions.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  // --- Session detail w/ roster (/admin/schedule/:sessionId) --------------
  // Real endpoint: GET /api/admin/sessions/:id
  http.get("/api/admin/sessions/:id", ({ params }) => {
    const session = sessions.find((s) => s.id === params.id);
    if (!session) {
      return HttpResponse.json({ code: "not_found", message: "Session not found" }, { status: 404 });
    }
    return HttpResponse.json({
      ...session,
      course: courseFor(session),
      roster: rosterFor(session.id),
      waitlist: waitlistFor(session.id),
    });
  }),

  // Real endpoint: PATCH /api/admin/bookings/:id -- mark a roster entry
  // attended/no-show (Session detail's "mark present/completed").
  http.patch("/api/admin/bookings/:id", async ({ params, request }) => {
    const booking = bookings.find((b) => b.id === params.id);
    if (!booking) {
      return HttpResponse.json({ code: "not_found", message: "Booking not found" }, { status: 404 });
    }
    const body = (await request.json()) as { status?: (typeof bookings)[number]["status"] };
    if (body.status) booking.status = body.status;
    return HttpResponse.json(booking);
  }),

  // Real endpoint: POST /api/admin/sessions/:id/waitlist/:entryId/promote --
  // move a waitlisted student into an open seat.
  http.post("/api/admin/sessions/:id/waitlist/:entryId/promote", ({ params }) => {
    const entryIndex = waitlistEntries.findIndex(
      (w) => w.id === params.entryId && w.session_id === params.id,
    );
    if (entryIndex === -1) {
      return HttpResponse.json({ code: "not_found", message: "Waitlist entry not found" }, { status: 404 });
    }
    const [entry] = waitlistEntries.splice(entryIndex, 1);
    const promoted = {
      id: `booking-${bookings.length + 1}`,
      session_id: entry.session_id,
      student_id: entry.student_id,
      party_size: entry.party_size,
      // Waitlist promotion happens from the admin screen -> manual entry.
      source: "admin" as const,
      status: "confirmed" as const,
      invoice_id: null,
    };
    bookings.push(promoted);
    return HttpResponse.json(promoted, { status: 201 });
  }),

  // --- Students (/admin/students) -----------------------------------------
  // Real endpoint: GET /api/admin/students
  http.get("/api/admin/students", () => {
    const withHistory = students.map((s) => ({
      ...s,
      bookings: bookings.filter((b) => b.student_id === s.id),
      waivers: waivers.filter((w) => w.student_id === s.id),
    }));
    return HttpResponse.json(withHistory);
  }),

  // Real endpoint: GET /api/admin/students/:id
  http.get("/api/admin/students/:id", ({ params }) => {
    const student = students.find((s) => s.id === params.id);
    if (!student) {
      return HttpResponse.json({ code: "not_found", message: "Student not found" }, { status: 404 });
    }
    return HttpResponse.json({
      ...student,
      bookings: bookings.filter((b) => b.student_id === student.id),
      waivers: waivers.filter((w) => w.student_id === student.id),
    });
  }),

  // --- Invoices (/admin/invoices) ------------------------------------------
  // Real endpoint: GET /api/admin/invoices
  http.get("/api/admin/invoices", () => {
    const withStudent = invoices.map((inv) => ({
      ...inv,
      student: students.find((s) => s.id === inv.student_id) ?? null,
    }));
    return HttpResponse.json(withStudent);
  }),

  // Real endpoint: GET /api/admin/invoices/:id
  http.get("/api/admin/invoices/:id", ({ params }) => {
    const invoice = invoices.find((i) => i.id === params.id);
    if (!invoice) {
      return HttpResponse.json({ code: "not_found", message: "Invoice not found" }, { status: 404 });
    }
    return HttpResponse.json({
      ...invoice,
      student: students.find((s) => s.id === invoice.student_id) ?? null,
    });
  }),

  // --- Record payment (/admin/invoices/:invoiceId/pay) ----------------------
  // Real endpoint: POST /api/admin/invoices/:id/payments
  http.post("/api/admin/invoices/:id/payments", async ({ params, request }) => {
    const invoice = invoices.find((i) => i.id === params.id);
    if (!invoice) {
      return HttpResponse.json({ code: "not_found", message: "Invoice not found" }, { status: 404 });
    }
    const body = (await request.json()) as { method?: MockPayment["method"]; amount?: string; note?: string };
    const amount = body.amount ?? "0.00";
    const payment: MockPayment = {
      id: `payment-${invoice.payments.length + 1}-${invoice.id}`,
      method: body.method ?? "cash",
      amount,
      recorded_at: new Date().toISOString(),
      note: body.note ?? "",
    };
    invoice.payments.push(payment);
    const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    invoice.amount_paid = paidTotal.toFixed(2);
    invoice.status = paidTotal >= Number(invoice.amount_due) ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
    return HttpResponse.json(invoice, { status: 201 });
  }),

  // --- Waivers (/admin/waivers) ---------------------------------------------
  // Real endpoint: GET /api/admin/waivers
  http.get("/api/admin/waivers", () => {
    const withStudent = waivers.map((w) => ({
      ...w,
      student: students.find((s) => s.id === w.student_id) ?? null,
    }));
    return HttpResponse.json(withStudent);
  }),

  // --- Settings (/admin/settings) --------------------------------------------
  // Real endpoint: GET /api/admin/settings, PATCH /api/admin/settings
  http.get("/api/admin/settings", () => {
    return HttpResponse.json(settings);
  }),

  http.patch("/api/admin/settings", async ({ request }) => {
    const body = (await request.json()) as Partial<typeof settings>;
    Object.assign(settings, body);
    return HttpResponse.json(settings);
  }),

  // --- Owner metrics (/admin dashboard tile) --------------------------------
  // Real endpoint: GET /api/admin/metrics/bookings-by-source
  // (api/admin_metrics.py). Computed live from the mock bookings so
  // waitlist promotions etc. move the numbers during a demo.
  http.get("/api/admin/metrics/bookings-by-source", () => {
    const zero = () => ({ bookings: 0, seats: 0 });
    const totals = { web: zero(), admin: zero() };
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      totals[b.source].bookings += 1;
      totals[b.source].seats += b.party_size;
    }
    // The mock data has no created_at; the demo shows one bucket for the
    // frozen mock month (doc 14's fixed "2026-07" sample clock).
    const monthly = [{ month: "2026-07", web: totals.web, admin: totals.admin }];
    return HttpResponse.json({ totals, monthly });
  }),

  // --- Calendar sync (/admin/calendar) ---------------------------------------
  // Real endpoint: GET /api/admin/calendar/feed-url (api/calendar.py).
  http.get("/api/admin/calendar/feed-url", () => {
    return HttpResponse.json({
      feed_url:
        "https://SITE-DOMAIN-TBD/api/calendar/feed.ics?key=SAMPLE-FEED-KEY",
    });
  }),

  // --- Logs (/admin/logs) -----------------------------------------------------
  // Real endpoints: GET /api/admin/logs/tail, GET /api/admin/logs/files
  // (api/admin_logs.py). Lines mirror logging/json_formatter.py's shape.
  http.get("/api/admin/logs/tail", () => {
    const line = (level: string, logger: string, message: string, minute: number) =>
      JSON.stringify({
        timestamp: `2026-07-04T09:${String(minute).padStart(2, "0")}:00+00:00`,
        level,
        logger,
        message,
        request_id: `req-${minute}`,
        module: logger.split(".").pop(),
        line: 42,
      });
    return HttpResponse.json([
      line("INFO", "melpino_backend.app.app", "SAMPLE -- application startup complete", 1),
      line("INFO", "melpino_backend.domain.booking.service", "create_booking: created booking_id=booking-2 session_id=session-1 party_size=2 source=web", 6),
      line("INFO", "melpino_backend.domain.booking.service", "create_booking: created booking_id=booking-3 session_id=session-1 party_size=1 source=admin", 12),
      line("WARNING", "melpino_backend.auth.rate_limit", "SAMPLE -- booking_create rate limit tripped for 203.0.113.9", 18),
      line("INFO", "melpino_backend.api.calendar", "calendar_feed: served 6 events", 25),
      line("ERROR", "melpino_backend.domain.notifications", "SAMPLE -- confirmation email failed (SMTP unreachable), booking kept", 31),
    ]);
  }),

  http.get("/api/admin/logs/files", () => {
    return HttpResponse.json([
      { name: "app.log", size_bytes: 48213, modified_at: 1783248000 },
      { name: "app.log.2026-07-03", size_bytes: 202144, modified_at: 1783161600 },
      { name: "app.log.2026-07-02", size_bytes: 187002, modified_at: 1783075200 },
    ]);
  }),
];
