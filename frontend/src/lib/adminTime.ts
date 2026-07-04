// Small date/time formatter for the admin mockup screens only
// (docs/design/14-admin-mockup.md). Deliberately separate from
// src/lib/time.ts's formatSessionTime/formatRetryAt -- those are the
// guest-booking-flow helpers owned by docs/design/04 and are still
// unimplemented stubs; this file has no dependency on that work landing.

export function formatAdminDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAdminDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
