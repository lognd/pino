// Dashboard (/admin) -- docs/design/14-admin-mockup.md's route list:
// "what does Mel want to see first thing in the morning" -- next few
// upcoming sessions, seats filled vs. capacity, a count of unpaid
// invoices, and quick links into the other screens.

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminDashboard } from "../../../api/dashboard";
import { SampleBanner } from "../../../components/SampleBanner";
import { formatAdminDateTime } from "../../../lib/adminTime";

export function AdminDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: fetchAdminDashboard,
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Dashboard
      </h1>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load the dashboard.</p>}

      {data && (
        <div className="mt-8 flex flex-col gap-10">
          <section>
            <h2 className="text-2xl font-bold uppercase text-mp-white">Upcoming sessions</h2>
            {data.upcoming_sessions.length === 0 && (
              <p className="mt-2 text-lg text-mp-muted">No upcoming sessions.</p>
            )}
            <ul className="mt-4 flex flex-col gap-4">
              {data.upcoming_sessions.map((session) => (
                <li key={session.id} className="border-2 border-mp-border bg-mp-surface p-4">
                  <Link
                    to={`/admin/schedule/${session.id}`}
                    className="text-xl font-semibold text-mp-white underline-offset-4 hover:underline"
                  >
                    {session.course?.title ?? "SAMPLE session"}
                  </Link>
                  <p className="mt-1 text-lg text-mp-muted">
                    {formatAdminDateTime(session.starts_at)} -- {session.location_name}
                  </p>
                  <p className="mt-1 text-lg text-mp-white">
                    Seats filled: {session.seats_filled} / {session.capacity}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold uppercase text-mp-white">Unpaid invoices</h2>
            <Link
              to="/admin/invoices"
              className="mt-2 inline-block text-xl font-semibold text-mp-red-text underline-offset-4 hover:underline"
            >
              {data.unpaid_invoice_count} unpaid invoice{data.unpaid_invoice_count === 1 ? "" : "s"}
            </Link>
          </section>

          <nav aria-label="Quick links" className="flex flex-wrap gap-6">
            <Link to="/admin/schedule" className="text-lg font-semibold text-mp-white underline">
              Schedule
            </Link>
            <Link to="/admin/students" className="text-lg font-semibold text-mp-white underline">
              Students
            </Link>
            <Link to="/admin/invoices" className="text-lg font-semibold text-mp-white underline">
              Invoices
            </Link>
            <Link to="/admin/waivers" className="text-lg font-semibold text-mp-white underline">
              Waivers
            </Link>
            <Link to="/admin/settings" className="text-lg font-semibold text-mp-white underline">
              Settings
            </Link>
          </nav>
        </div>
      )}
    </main>
  );
}
