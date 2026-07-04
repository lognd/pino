// Admin signed-waiver storage reads -- docs/design/14-admin-mockup.md's
// Waivers screen; real domain in docs/design/03-database.md's `waivers`
// table (file_key resolves through storage, see docs/design/13).

import { apiGet } from "./client";

export interface AdminWaiver {
  id: string;
  student_id: string;
  session_id: string | null;
  template_version: string;
  file_key: string;
  content_type: string;
  uploaded_at: string;
  student: { id: string; full_name: string; email: string; phone: string } | null;
}

export function fetchAdminWaivers(): Promise<AdminWaiver[]> {
  return apiGet<AdminWaiver[]>("/api/admin/waivers");
}
