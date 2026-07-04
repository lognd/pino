// Client-side log capture -- the one place any frontend code should record
// something worth having in a crash report or a low-fps hero degradation
// event (docs/design/08-landing-hero.md's rung 4). Ported nearly verbatim
// from logand.app/frontend/src/lib/logging.ts: a bounded in-memory ring
// buffer (never grows unbounded), mirrored into localStorage (also capped)
// so a crash that reloads the page doesn't lose the entries that explain
// it, plus leveled console output and window-level error/rejection capture.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 500;
const STORAGE_KEY = "melpino.clientLogs";

let buffer: LogEntry[] = [];
let installed = false;

function loadFromStorage(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
  } catch {
    // Corrupt or inaccessible storage (private browsing, quota, bad JSON
    // from an older schema) -- start fresh rather than crash the logger
    // itself, which would defeat the entire point of it.
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // Storage full/unavailable -- the in-memory buffer (this session's
    // logs) still works fine; only cross-reload persistence is lost.
  }
}

// TODO(P2+): once melpino has an admin logs surface (not yet specced --
// see docs/design/ for the admin area), post entries to a backend endpoint
// here behind a feature flag, the way logand.app's ReportProblem "download
// logs" flow does locally. Until that route exists, this stays a no-op
// transport: local ring buffer + console only, never a network call.
function reportToBackend(_entry: LogEntry): void {
  // Intentionally empty -- see TODO above.
}

const CONSOLE_METHOD: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function record(level: LogLevel, message: string, detail?: string): void {
  const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, detail };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    // Drop oldest first -- the ring-buffer bound that guarantees this
    // never grows past MAX_ENTRIES regardless of how long the tab has
    // been open or how noisy a bug's error loop is.
    buffer = buffer.slice(buffer.length - MAX_ENTRIES);
  }
  persist();
  CONSOLE_METHOD[level](`[${level.toUpperCase()}] ${message}`, detail ?? "");
  reportToBackend(entry);
}

export function logDebug(message: string, detail?: string): void {
  record("debug", message, detail);
}

export function logInfo(message: string, detail?: string): void {
  record("info", message, detail);
}

export function logWarn(message: string, detail?: string): void {
  record("warn", message, detail);
}

export function logError(message: string, detail?: string): void {
  record("error", message, detail);
}

export function getLogEntries(): LogEntry[] {
  return [...buffer];
}

export function clearLogEntries(): void {
  buffer = [];
  persist();
}

export function formatLogsForExport(): string {
  const lines = buffer.map(
    (e) => `${e.timestamp} [${e.level.toUpperCase()}] ${e.message}${e.detail ? `\n  ${e.detail}` : ""}`,
  );
  return [
    `melpino client log export`,
    `generated: ${new Date().toISOString()}`,
    `user agent: ${navigator.userAgent}`,
    `url: ${location.href}`,
    "",
    ...lines,
  ].join("\n");
}

/** Installs window.onerror / unhandledrejection handlers -- call once,
 * from main.tsx, before rendering. Safe to call more than once (a no-op
 * after the first call) so it can't accidentally double-register across
 * a hot-reload in dev. */
export function installGlobalLogging(): void {
  if (installed) return;
  installed = true;
  buffer = loadFromStorage();

  window.addEventListener("error", (event) => {
    logError(
      "uncaught error",
      `${event.message}\n${event.error?.stack ?? "(no stack)"}`,
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const detail =
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    logError("unhandled promise rejection", detail);
  });
}
