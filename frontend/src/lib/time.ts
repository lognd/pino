// Small time-formatting helpers shared across the booking flow (session
// times, "try again in ..." rate-limit countdowns). Pure functions only --
// no timers/state here, so the booking flow's own countdown loop stays
// directly unit-testable.

/** Plain-words retry message for a 429's Retry-After seconds -- e.g.
 * "Please try again in 47 seconds." / "...in 2 minutes." Never shows a
 * bare number with no unit (docs/design/09's plain-language contract). */
export function formatRetryAt(retryAfterSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(retryAfterSeconds));
  if (seconds <= 0) {
    return "You can try again now.";
  }
  if (seconds < 60) {
    const unit = seconds === 1 ? "second" : "seconds";
    return `Please try again in ${seconds} ${unit}.`;
  }
  const minutes = Math.ceil(seconds / 60);
  const unit = minutes === 1 ? "minute" : "minutes";
  return `Please try again in ${minutes} ${unit}.`;
}

/** Human-readable session date/time from an ISO timestamp, e.g.
 * "Sat, Jun 14 at 9:00 AM" -- always rendered in the viewer's local
 * timezone (the browser's Intl implementation handles DST for us). */
export function formatSessionTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }
  const datePart = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${datePart} at ${timePart}`;
}
