// Client-side log capture -- the one place any frontend code should record
// something worth having in a crash report or a low-fps hero degradation
// event (docs/design/08-landing-hero.md's rung 4). CRIB:
// logand.app/frontend/src/lib/logging.ts for the full bounded-ring-buffer
// + localStorage-mirrored implementation; port it here nearly verbatim,
// renaming the storage key.
//
// TODO(impl): docs/design/07-frontend-architecture.md

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  detail?: string;
}

export function logDebug(_message: string, _detail?: string): void {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function logInfo(_message: string, _detail?: string): void {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function logWarn(_message: string, _detail?: string): void {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function logError(_message: string, _detail?: string): void {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function getLogEntries(): LogEntry[] {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function clearLogEntries(): void {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function formatLogsForExport(): string {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

/** Installs window.onerror / unhandledrejection handlers -- call once,
 * from main.tsx, before rendering. Safe to call more than once. */
export function installGlobalLogging(): void {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}
