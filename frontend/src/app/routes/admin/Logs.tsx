// Logs (/admin/logs) -- docs/design/14-admin-mockup.md addendum, cribbed
// from logand.app's admin logs portal: tail the live backend JSON log
// with a level filter, list/download rotated files, and surface this
// browser session's client-side entries (lib/logging.ts) with an export
// affordance for bug reports.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  listLogFiles,
  logFileDownloadUrl,
  parseLogLine,
  tailLiveLog,
} from "../../../api/adminLogs";
import { getLogEntries, formatLogsForExport } from "../../../lib/logging";
import { SampleBanner } from "../../../components/SampleBanner";

const LEVELS = ["ALL", "DEBUG", "INFO", "WARNING", "ERROR"] as const;

const BTN =
  "min-h-[48px] border-2 border-mp-border px-4 py-2 text-lg font-bold uppercase text-mp-white hover:border-mp-white";

function levelColor(level: string): string {
  if (level === "ERROR" || level === "CRITICAL") return "text-mp-red-text";
  if (level === "WARNING" || level === "WARN") return "text-mp-warn";
  return "text-mp-muted";
}

export function AdminLogs() {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("ALL");

  const tail = useQuery({
    queryKey: ["admin", "logs", "tail"],
    queryFn: () => tailLiveLog(300),
  });
  const files = useQuery({
    queryKey: ["admin", "logs", "files"],
    queryFn: listLogFiles,
  });

  const rows = useMemo(() => {
    const parsed = (tail.data ?? []).map((raw) => ({ raw, entry: parseLogLine(raw) }));
    if (level === "ALL") return parsed;
    return parsed.filter((r) => (r.entry?.level ?? "").toUpperCase().startsWith(level));
  }, [tail.data, level]);

  const clientEntries = getLogEntries();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Logs
      </h1>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold uppercase text-mp-white">Server log (live)</h2>
          <label className="ml-auto flex items-center gap-2 text-lg text-mp-muted">
            Level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
              className="border-2 border-mp-border bg-mp-black-true px-2 py-1 text-lg text-mp-white"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={BTN} onClick={() => void tail.refetch()}>
            Refresh
          </button>
        </div>

        {tail.isLoading && <p className="mt-4 text-lg text-mp-muted">Loading...</p>}
        {tail.isError && (
          <p className="mt-4 text-lg text-mp-red-text">Could not load the server log.</p>
        )}
        {tail.data && rows.length === 0 && (
          <p className="mt-4 text-lg text-mp-muted">No matching log lines.</p>
        )}
        {rows.length > 0 && (
          <div className="mt-4 max-h-[28rem] overflow-auto border-2 border-mp-border bg-mp-black-true p-3 font-mono text-sm">
            <ul className="flex flex-col gap-1">
              {rows.map((row, i) => (
                <li key={i} className="whitespace-pre-wrap break-all">
                  {row.entry ? (
                    <>
                      <span className="text-mp-muted">{row.entry.timestamp}</span>{" "}
                      <span className={`font-bold ${levelColor(row.entry.level)}`}>
                        {row.entry.level}
                      </span>{" "}
                      <span className="text-mp-muted">{row.entry.logger}</span>{" "}
                      <span className="text-mp-white">{row.entry.message}</span>
                    </>
                  ) : (
                    <span className="text-mp-muted">{row.raw}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold uppercase text-mp-white">Log files</h2>
        {files.data && files.data.length === 0 && (
          <p className="mt-2 text-lg text-mp-muted">No log files on the server yet.</p>
        )}
        {files.data && files.data.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {files.data.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-4 text-lg">
                <a
                  href={logFileDownloadUrl(f.name)}
                  className="font-semibold text-mp-white underline underline-offset-4"
                  download
                >
                  {f.name}
                </a>
                <span className="text-mp-muted">{Math.ceil(f.size_bytes / 1024)} KB</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold uppercase text-mp-white">
            This browser session
          </h2>
          <button
            type="button"
            className={`${BTN} ml-auto`}
            onClick={() => {
              const blob = new Blob([formatLogsForExport()], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "melpino-client-logs.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export
          </button>
        </div>
        {clientEntries.length === 0 ? (
          <p className="mt-2 text-lg text-mp-muted">
            Nothing logged in this browser session.
          </p>
        ) : (
          <div className="mt-4 max-h-64 overflow-auto border-2 border-mp-border bg-mp-black-true p-3 font-mono text-sm">
            <ul className="flex flex-col gap-1">
              {clientEntries.map((entry, i) => (
                <li key={i} className="whitespace-pre-wrap break-all">
                  <span className={`font-bold ${levelColor(entry.level.toUpperCase())}`}>
                    {entry.level.toUpperCase()}
                  </span>{" "}
                  <span className="text-mp-white">{entry.message}</span>{" "}
                  {entry.detail && <span className="text-mp-muted">{entry.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <nav aria-label="Quick links" className="mt-8 flex flex-wrap gap-6">
        <Link to="/admin" className="text-lg font-semibold text-mp-white underline">
          Dashboard
        </Link>
      </nav>
    </main>
  );
}
