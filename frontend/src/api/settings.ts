// Admin settings screen reads/writes -- docs/design/14-admin-mockup.md's
// Settings screen ("what does Mel expect to change himself"). The
// business-name fields are DISPLAY-ONLY here; their one real home is
// AppConfig (backend) and src/lib/brand.ts (frontend build-time), per
// docs/design/00-overview.md's "Business identity" section -- this
// endpoint exists only to prove the value is configurable, not to be a
// second source of truth.

import { apiGet, apiPatch } from "./client";

export interface AdminSettings {
  business_legal_name: string;
  business_short_name: string;
  default_class_capacity: number;
  email_reminders_enabled: boolean;
  sms_reminders_enabled: boolean;
}

export function fetchAdminSettings(): Promise<AdminSettings> {
  return apiGet<AdminSettings>("/api/admin/settings");
}

export function updateAdminSettings(
  patch: Partial<AdminSettings>,
): Promise<AdminSettings> {
  return apiPatch<AdminSettings>("/api/admin/settings", patch);
}
