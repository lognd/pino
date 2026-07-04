// Students (/admin/students) -- docs/design/14-admin-mockup.md: searchable
// list of students with course history and completion status; a
// drill-down shows their sessions, certs, and waiver status. The
// drill-down is an inline expand rather than a separate route -- doc 14
// only names "open a student" as an interaction, not a dedicated URL, and
// this keeps the route table unchanged.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminStudents } from "../../../api/students";
import { SampleBanner } from "../../../components/SampleBanner";
import { Field } from "../../../components/Field";

export function AdminStudents() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "students"],
    queryFn: fetchAdminStudents,
  });
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = (data ?? []).filter((s) =>
    s.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Students
      </h1>

      <div className="mt-6 max-w-sm">
        <Field
          id="student-search"
          label="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load students.</p>}

      <ul className="mt-8 flex flex-col gap-4">
        {filtered.map((student) => {
          const isOpen = openId === student.id;
          const completedCount = student.bookings.filter((b) => b.status === "attended").length;
          const hasWaiver = student.waivers.length > 0;
          return (
            <li key={student.id} className="border-2 border-mp-border bg-mp-surface p-4">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : student.id)}
                aria-expanded={isOpen}
                className="min-h-[48px] text-left text-xl font-semibold text-mp-white underline-offset-4 hover:underline"
              >
                {student.full_name}
              </button>
              <p className="mt-1 text-lg text-mp-muted">
                {student.bookings.length} session{student.bookings.length === 1 ? "" : "s"} -- {completedCount} completed
                -- waiver {hasWaiver ? "on file" : "missing"}
              </p>
              {isOpen && (
                <div className="mt-4 flex flex-col gap-2 border-t-2 border-mp-border pt-4">
                  <p className="text-lg text-mp-white">Email: {student.email}</p>
                  <p className="text-lg text-mp-white">Phone: {student.phone}</p>
                  <h3 className="mt-2 text-lg font-semibold uppercase text-mp-white">Sessions</h3>
                  {student.bookings.length === 0 && <p className="text-lg text-mp-muted">None yet.</p>}
                  <ul className="flex flex-col gap-1">
                    {student.bookings.map((b) => (
                      <li key={b.id} className="text-lg text-mp-muted">
                        Session {b.session_id} -- {b.status}
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-2 text-lg font-semibold uppercase text-mp-white">Waivers</h3>
                  {student.waivers.length === 0 && <p className="text-lg text-mp-muted">No waiver on file.</p>}
                  <ul className="flex flex-col gap-1">
                    {student.waivers.map((w) => (
                      <li key={w.id} className="text-lg text-mp-muted">
                        {w.template_version} -- uploaded {w.uploaded_at.slice(0, 10)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
