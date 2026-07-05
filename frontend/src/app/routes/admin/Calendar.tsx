// Calendar (/admin/calendar) -- docs/design/14-admin-mockup.md addendum:
// Mel's month view of the schedule, plus the "sync to Google Calendar"
// box (the subscribable ICS feed URL from api/adminCalendar.ts). Grid
// math lives in lib/calendarGrid.ts (pure, unit-tested); this renders.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminSessions } from "../../../api/sessions";
import { fetchCalendarFeedUrl } from "../../../api/adminCalendar";
import { SampleBanner } from "../../../components/SampleBanner";
import { bucketByDay, monthGrid, monthTitle } from "../../../lib/calendarGrid";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BTN =
  "min-h-[48px] border-2 border-mp-border px-4 py-2 text-lg font-bold uppercase text-mp-white hover:border-mp-white";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The copy-paste subscribe box. Google Calendar: Other calendars > From
 * URL; Apple/Outlook subscribe to the same address. */
function SyncBox() {
  const { data } = useQuery({
    queryKey: ["admin", "calendar-feed-url"],
    queryFn: fetchCalendarFeedUrl,
  });
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  return (
    <section className="border-2 border-mp-border bg-mp-surface p-4">
      <h2 className="text-2xl font-bold uppercase text-mp-white">
        Sync to Google Calendar
      </h2>
      {data.feed_url === null ? (
        <p className="mt-2 text-lg text-mp-muted">
          Calendar sync is not configured yet: set CALENDAR_FEED_KEY on the
          server to enable the subscribe link.
        </p>
      ) : (
        <>
          <p className="mt-2 text-lg text-mp-muted">
            In Google Calendar choose Other calendars, then From URL, and
            paste this address. Classes stay in sync automatically. Works
            with Apple and Outlook calendars too.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="max-w-full overflow-x-auto border-2 border-mp-border bg-mp-black-true px-3 py-2 text-base text-mp-white">
              {data.feed_url}
            </code>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                void navigator.clipboard?.writeText(data.feed_url ?? "");
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function AdminCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ["admin", "sessions"],
    queryFn: fetchAdminSessions,
  });

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(
    () => bucketByDay(sessions ?? [], (s) => s.starts_at),
    [sessions],
  );

  function shiftMonth(delta: number): void {
    const shifted = new Date(year, month + delta, 1);
    setYear(shifted.getFullYear());
    setMonth(shifted.getMonth());
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Calendar
      </h1>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className={BTN} onClick={() => shiftMonth(-1)}>
          &larr; Previous
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth());
          }}
        >
          Today
        </button>
        <button type="button" className={BTN} onClick={() => shiftMonth(1)}>
          Next &rarr;
        </button>
        <h2 className="ml-2 text-2xl font-bold uppercase text-mp-white">
          {monthTitle(year, month)}
        </h2>
      </div>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && (
        <p className="mt-6 text-lg text-mp-red-text">Could not load the schedule.</p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className="border-2 border-mp-border bg-mp-surface px-2 py-2 text-left text-base font-bold uppercase text-mp-muted"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day) => {
                  const daySessions = byDay.get(day.iso) ?? [];
                  return (
                    <td
                      key={day.iso}
                      className={`h-28 min-w-[104px] border-2 border-mp-border p-1 align-top ${
                        day.inMonth ? "" : "opacity-40"
                      } ${day.isToday ? "bg-mp-surface" : ""}`}
                    >
                      <p
                        className={`px-1 text-base font-bold ${
                          day.isToday ? "text-mp-red-text" : "text-mp-muted"
                        }`}
                      >
                        {day.dayOfMonth}
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {daySessions.map((s) => (
                          <li key={s.id}>
                            <Link
                              to={`/admin/schedule/${s.id}`}
                              className={`block border-l-4 px-1 py-0.5 text-sm font-semibold text-mp-white hover:underline ${
                                s.status === "cancelled"
                                  ? "border-mp-border line-through opacity-60"
                                  : "border-mp-red"
                              }`}
                            >
                              {formatTime(s.starts_at)} {s.course?.title ?? "Session"}
                              <span className="block text-xs font-normal text-mp-muted">
                                {s.seats_filled}/{s.capacity} seats
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <SyncBox />
      </div>

      <nav aria-label="Quick links" className="mt-8 flex flex-wrap gap-6">
        <Link to="/admin" className="text-lg font-semibold text-mp-white underline">
          Dashboard
        </Link>
        <Link to="/admin/schedule" className="text-lg font-semibold text-mp-white underline">
          Schedule list
        </Link>
      </nav>
    </main>
  );
}
