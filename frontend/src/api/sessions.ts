// Admin schedule/session reads and roster mutations -- docs/design/14's
// Schedule and Session-detail screens; real domain in
// docs/design/04-booking-and-scheduling.md (class_sessions/bookings
// shapes). See docs/design/03-database.md for the underlying columns.

import { apiGet, apiPatch, apiPost } from "./client";

// Distinct from api/courses.ts's public `Course` (name/short_description/
// price_label) -- the admin surface reads the raw catalog row shape per
// docs/design/03-database.md's `courses` table, not the public listing
// projection.
export interface AdminCourse {
  id: string;
  slug: string;
  kind: "law_cert" | "technique" | "private";
  title: string;
  summary: string;
  price: string;
  deposit: string;
  duration_min: number;
  default_capacity: number;
  is_active: boolean;
}

export interface AdminSessionSummary {
  id: string;
  course_id: string;
  course: AdminCourse | null;
  starts_at: string;
  ends_at: string;
  location_name: string;
  location_addr: string;
  capacity: number;
  status: "draft" | "published" | "full" | "completed" | "cancelled";
  notes: string;
  seats_filled: number;
}

export interface AdminRosterEntry {
  id: string;
  session_id: string;
  student_id: string;
  party_size: number;
  status: "confirmed" | "cancelled" | "attended" | "no_show";
  invoice_id: string | null;
  student: { id: string; full_name: string; email: string; phone: string } | null;
}

export interface AdminWaitlistEntry {
  id: string;
  session_id: string;
  student_id: string;
  party_size: number;
  notified_at: string | null;
  student: { id: string; full_name: string; email: string; phone: string } | null;
}

export interface AdminSessionDetail extends AdminSessionSummary {
  roster: AdminRosterEntry[];
  waitlist: AdminWaitlistEntry[];
}

export function fetchAdminSessions(): Promise<AdminSessionSummary[]> {
  return apiGet<AdminSessionSummary[]>("/api/admin/sessions");
}

export function fetchAdminSession(sessionId: string): Promise<AdminSessionDetail> {
  return apiGet<AdminSessionDetail>(`/api/admin/sessions/${sessionId}`);
}

export function updateBookingStatus(
  bookingId: string,
  status: AdminRosterEntry["status"],
): Promise<AdminRosterEntry> {
  return apiPatch<AdminRosterEntry>(`/api/admin/bookings/${bookingId}`, { status });
}

export function promoteWaitlistEntry(
  sessionId: string,
  entryId: string,
): Promise<AdminRosterEntry> {
  return apiPost<AdminRosterEntry>(`/api/admin/sessions/${sessionId}/waitlist/${entryId}/promote`);
}
