// Admin student roster reads -- docs/design/14-admin-mockup.md's Students
// screen; real domain in docs/design/03-database.md's `students` table.

import { apiGet } from "./client";

export interface AdminStudentBooking {
  id: string;
  session_id: string;
  student_id: string;
  party_size: number;
  status: "confirmed" | "cancelled" | "attended" | "no_show";
  invoice_id: string | null;
}

export interface AdminStudentWaiver {
  id: string;
  student_id: string;
  session_id: string | null;
  template_version: string;
  file_key: string;
  content_type: string;
  uploaded_at: string;
}

export interface AdminStudent {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  notes: string;
  bookings: AdminStudentBooking[];
  waivers: AdminStudentWaiver[];
}

export function fetchAdminStudents(): Promise<AdminStudent[]> {
  return apiGet<AdminStudent[]>("/api/admin/students");
}

export function fetchAdminStudent(studentId: string): Promise<AdminStudent> {
  return apiGet<AdminStudent>(`/api/admin/students/${studentId}`);
}
