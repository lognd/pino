// Admin dashboard summary -- docs/design/14-admin-mockup.md's Dashboard
// screen ("what does Mel want to see first thing in the morning").
// Answered by MSW during the mockup phase; the real endpoint will live
// wherever docs/design/04-booking-and-scheduling.md ends up specifying
// aggregate reads.

import { apiGet } from "./client";
import type { AdminSessionSummary } from "./sessions";

export interface AdminDashboard {
  upcoming_sessions: AdminSessionSummary[];
  unpaid_invoice_count: number;
}

export function fetchAdminDashboard(): Promise<AdminDashboard> {
  return apiGet<AdminDashboard>("/api/admin/dashboard");
}
