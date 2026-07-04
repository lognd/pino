// Waivers (/admin/waivers) -- docs/design/14-admin-mockup.md: signed-waiver
// storage per student, with a mock "view document" that opens a sample
// placeholder. Interactions: filter to students missing a waiver; open a
// sample document.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminWaivers } from "../../../api/waivers";
import { fetchAdminStudents } from "../../../api/students";
import { SampleBanner } from "../../../components/SampleBanner";
import { BigButton } from "../../../components/BigButton";

export function AdminWaivers() {
  const waiversQuery = useQuery({ queryKey: ["admin", "waivers"], queryFn: fetchAdminWaivers });
  const studentsQuery = useQuery({ queryKey: ["admin", "students"], queryFn: fetchAdminStudents });
  const [missingOnly, setMissingOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const isLoading = waiversQuery.isLoading || studentsQuery.isLoading;
  const isError = waiversQuery.isError || studentsQuery.isError;

  const waivers = waiversQuery.data ?? [];
  const studentsWithWaiver = new Set(waivers.map((w) => w.student_id));
  const missingStudents = (studentsQuery.data ?? []).filter((s) => !studentsWithWaiver.has(s.id));

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Waivers
      </h1>

      <div className="mt-6">
        <BigButton type="button" variant="secondary" onClick={() => setMissingOnly((v) => !v)}>
          {missingOnly ? "Show all" : "Show missing a waiver"}
        </BigButton>
      </div>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load waivers.</p>}

      {missingOnly ? (
        <ul className="mt-8 flex flex-col gap-4">
          {missingStudents.length === 0 && (
            <p className="text-lg text-mp-muted">Every student has a waiver on file.</p>
          )}
          {missingStudents.map((student) => (
            <li key={student.id} className="border-2 border-mp-red-text bg-mp-surface p-4">
              <p className="text-xl font-semibold text-mp-white">{student.full_name}</p>
              <p className="mt-1 text-lg text-mp-red-text">No waiver on file.</p>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {waivers.map((waiver) => {
            const isOpen = openId === waiver.id;
            return (
              <li key={waiver.id} className="border-2 border-mp-border bg-mp-surface p-4">
                <p className="text-xl font-semibold text-mp-white">
                  {waiver.student?.full_name ?? "SAMPLE student"}
                </p>
                <p className="mt-1 text-lg text-mp-muted">
                  Template {waiver.template_version} -- uploaded {waiver.uploaded_at.slice(0, 10)}
                </p>
                <div className="mt-3">
                  <BigButton type="button" variant="secondary" onClick={() => setOpenId(isOpen ? null : waiver.id)}>
                    {isOpen ? "Hide document" : "View document"}
                  </BigButton>
                </div>
                {isOpen && (
                  <p className="mt-3 border-2 border-mp-border bg-mp-black p-4 text-lg text-mp-muted">
                    SAMPLE waiver document placeholder -- {waiver.file_key} ({waiver.content_type})
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
