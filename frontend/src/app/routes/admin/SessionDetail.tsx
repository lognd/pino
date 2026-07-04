// Session detail w/ roster (/admin/schedule/:sessionId) --
// docs/design/14-admin-mockup.md: date/time/location, capacity, the
// enrolled roster, and the waitlist. Interactions: mark a student
// present/completed, move a waitlisted student into an open seat.

import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminSession,
  promoteWaitlistEntry,
  updateBookingStatus,
  type AdminRosterEntry,
} from "../../../api/sessions";
import { SampleBanner } from "../../../components/SampleBanner";
import { BigButton } from "../../../components/BigButton";
import { StatusBadge, type Status } from "../../../components/StatusBadge";
import { formatAdminDateTime } from "../../../lib/adminTime";

const ROSTER_STATUS_LABEL: Record<AdminRosterEntry["status"], Status> = {
  confirmed: "confirmed",
  cancelled: "unpaid",
  attended: "paid",
  no_show: "unpaid",
};

export function AdminSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["admin", "session", sessionId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchAdminSession(sessionId as string),
    enabled: !!sessionId,
  });

  const markMutation = useMutation({
    mutationFn: (vars: { bookingId: string; status: AdminRosterEntry["status"] }) =>
      updateBookingStatus(vars.bookingId, vars.status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const promoteMutation = useMutation({
    mutationFn: (entryId: string) => promoteWaitlistEntry(sessionId as string, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Session detail
      </h1>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load this session.</p>}

      {data && (
        <div className="mt-8 flex flex-col gap-10">
          <section className="border-2 border-mp-border bg-mp-surface p-4">
            <h2 className="text-2xl font-bold text-mp-white">{data.course?.title ?? "SAMPLE session"}</h2>
            <p className="mt-1 text-lg text-mp-muted">
              {formatAdminDateTime(data.starts_at)} -- {formatAdminDateTime(data.ends_at)}
            </p>
            <p className="mt-1 text-lg text-mp-white">
              {data.location_name} -- {data.location_addr}
            </p>
            <p className="mt-1 text-lg text-mp-white">
              Capacity: {data.seats_filled} / {data.capacity} -- {data.status}
            </p>
            {data.notes && <p className="mt-2 text-lg text-mp-muted">{data.notes}</p>}
          </section>

          <section>
            <h2 className="text-2xl font-bold uppercase text-mp-white">Roster</h2>
            {data.roster.length === 0 && <p className="mt-2 text-lg text-mp-muted">No students enrolled yet.</p>}
            <ul className="mt-4 flex flex-col gap-4">
              {data.roster.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-2 border-mp-border bg-mp-surface p-4"
                >
                  <div>
                    <Link
                      to="/admin/students"
                      className="text-xl font-semibold text-mp-white underline-offset-4 hover:underline"
                    >
                      {entry.student?.full_name ?? "SAMPLE student"}
                    </Link>
                    <p className="mt-1 text-lg text-mp-muted">Party size: {entry.party_size}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={ROSTER_STATUS_LABEL[entry.status]} />
                    <BigButton
                      type="button"
                      variant="secondary"
                      disabled={markMutation.isPending || entry.status === "attended"}
                      onClick={() => markMutation.mutate({ bookingId: entry.id, status: "attended" })}
                    >
                      Mark attended
                    </BigButton>
                    <BigButton
                      type="button"
                      variant="secondary"
                      disabled={markMutation.isPending || entry.status === "no_show"}
                      onClick={() => markMutation.mutate({ bookingId: entry.id, status: "no_show" })}
                    >
                      Mark no-show
                    </BigButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold uppercase text-mp-white">Waitlist</h2>
            {data.waitlist.length === 0 && <p className="mt-2 text-lg text-mp-muted">No one waitlisted.</p>}
            <ul className="mt-4 flex flex-col gap-4">
              {data.waitlist.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-2 border-mp-border bg-mp-surface p-4"
                >
                  <div>
                    <p className="text-xl font-semibold text-mp-white">
                      {entry.student?.full_name ?? "SAMPLE student"}
                    </p>
                    <p className="mt-1 text-lg text-mp-muted">Party size: {entry.party_size}</p>
                  </div>
                  <BigButton
                    type="button"
                    disabled={promoteMutation.isPending}
                    onClick={() => promoteMutation.mutate(entry.id)}
                  >
                    Promote to roster
                  </BigButton>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
