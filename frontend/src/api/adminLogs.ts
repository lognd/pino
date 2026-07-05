// Read-only admin surface over the backend's api/admin_logs.py -- CRIB:
// logand.app frontend/src/api/adminLogs.ts. No mutation endpoints by
// design: log files are never edited or deleted through the UI, only
// pruned server-side by logging/retention.py on its own schedule.

import { apiGet } from "./client";

export interface LogFileInfo {
  name: string;
  size_bytes: number;
  modified_at: number;
}

/** One parsed line of the backend's JSON log (logging/json_formatter.py). */
export interface LogEntryLine {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  request_id?: string;
  module?: string;
  line?: number;
}

export function listLogFiles(): Promise<LogFileInfo[]> {
  return apiGet<LogFileInfo[]>("/api/admin/logs/files");
}

export function tailLiveLog(lines = 200): Promise<string[]> {
  return apiGet<string[]>(`/api/admin/logs/tail?lines=${lines}`);
}

export function logFileDownloadUrl(name: string): string {
  return `/api/admin/logs/files/${encodeURIComponent(name)}`;
}

/** Parse one raw NDJSON log line; null for anything unparseable (the
 * viewer shows those raw rather than dropping them silently). */
export function parseLogLine(raw: string): LogEntryLine | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "level" in value &&
      "message" in value
    ) {
      return value as LogEntryLine;
    }
    return null;
  } catch {
    return null;
  }
}
