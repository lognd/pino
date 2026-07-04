// Route table -- docs/design/07-frontend-architecture.md's directory
// structure and docs/design/14-admin-mockup.md's route list.
//
// TODO(impl): docs/design/07-frontend-architecture.md

import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Shell } from "./app/layout/Shell";

// Dev-gated below and lazy, so hero-lab never enters the production
// bundle or route table -- see docs/design/08-landing-hero.md.
const HeroLab = lazy(() =>
  import("./hero/HeroLab").then((m) => ({ default: m.HeroLab })),
);
import { AdminGuard } from "./app/layout/AdminGuard";
import { Landing } from "./app/routes/public/Landing";
import { Courses } from "./app/routes/public/Courses";
import { CourseDetail } from "./app/routes/public/CourseDetail";
import { About } from "./app/routes/public/About";
import { Contact } from "./app/routes/public/Contact";
import { Book } from "./app/routes/public/Book";
import { ManageBooking } from "./app/routes/public/ManageBooking";
import { Pay } from "./app/routes/public/Pay";
import { LegalPage } from "./app/routes/public/LegalPage";
import { AdminLogin } from "./app/routes/admin/Login";
import { AdminDashboard } from "./app/routes/admin/Dashboard";
import { AdminSchedule } from "./app/routes/admin/Schedule";
import { AdminSessionDetail } from "./app/routes/admin/SessionDetail";
import { AdminStudents } from "./app/routes/admin/Students";
import { AdminInvoices } from "./app/routes/admin/Invoices";
import { AdminRecordPayment } from "./app/routes/admin/RecordPayment";
import { AdminWaivers } from "./app/routes/admin/Waivers";
import { AdminSettings } from "./app/routes/admin/Settings";

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:slug" element={<CourseDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/book" element={<Book />} />
        <Route path="/booking/:token" element={<ManageBooking />} />
        <Route path="/pay/:token" element={<Pay />} />
        <Route path="/legal/privacy" element={<LegalPage />} />
        <Route path="/legal/terms" element={<LegalPage />} />
        <Route path="/legal/disclaimers" element={<LegalPage />} />
        <Route path="/legal/:page" element={<LegalPage />} />

        {import.meta.env.DEV && (
          <Route
            path="/hero-lab"
            element={
              <Suspense fallback={null}>
                <HeroLab />
              </Suspense>
            }
          />
        )}

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/schedule"
          element={
            <AdminGuard>
              <AdminSchedule />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/schedule/:sessionId"
          element={
            <AdminGuard>
              <AdminSessionDetail />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/students"
          element={
            <AdminGuard>
              <AdminStudents />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/invoices"
          element={
            <AdminGuard>
              <AdminInvoices />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/invoices/:invoiceId/pay"
          element={
            <AdminGuard>
              <AdminRecordPayment />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/waivers"
          element={
            <AdminGuard>
              <AdminWaivers />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <AdminGuard>
              <AdminSettings />
            </AdminGuard>
          }
        />
      </Routes>
    </Shell>
  );
}
