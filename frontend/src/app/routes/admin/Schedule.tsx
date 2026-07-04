// Calendar / Schedule (/admin/schedule) -- docs/design/14-admin-mockup.md.
// Rendered as a date-ordered list rather than a full calendar grid for the
// mockup -- one of the discovery questions this screen exists to ask Mel
// ("does Mel think in a calendar, or a list") is answered by watching how
// he reacts to the list, not by pre-guessing a calendar UI. Includes a
// mock-only "new session" quick-add form per doc 14's interactions.

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminSessions } from "../../../api/sessions";
import { SampleBanner } from "../../../components/SampleBanner";
import { BigButton } from "../../../components/BigButton";
import { Field } from "../../../components/Field";
import { formatAdminDateTime } from "../../../lib/adminTime";
import { apiPost } from "../../../api/client";
import type { AdminSessionSummary } from "../../../api/sessions";

export function AdminSchedule() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "sessions"],
    queryFn: fetchAdminSessions,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [locationName, setLocationName] = useState("SAMPLE Range, Clearwater");
  const [capacity, setCapacity] = useState(12);
  const [startsAt, setStartsAt] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<AdminSessionSummary>("/api/admin/sessions", {
        location_name: locationName,
        capacity,
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "sessions"] });
      setShowCreate(false);
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  const sorted = data ? [...data].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 pt-16">
      <SampleBanner />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
          Schedule
        </h1>
        <BigButton type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "New session"}
        </BigButton>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-6 border-2 border-mp-border bg-mp-surface p-6">
          <Field
            id="new-session-location"
            label="Location"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
          />
          <Field
            id="new-session-starts-at"
            label="Starts at"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Field
            id="new-session-capacity"
            label="Capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <BigButton type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create draft session (mock-only)"}
          </BigButton>
        </form>
      )}

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load the schedule.</p>}

      <ul className="mt-8 flex flex-col gap-4">
        {sorted.map((session) => (
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
              Seats: {session.seats_filled} / {session.capacity} -- {session.status}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
