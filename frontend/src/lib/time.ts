// Small time-formatting helpers shared across the booking flow (session
// times, "try again at ..." rate-limit messages). CRIB:
// logand.app/frontend/src/lib/time.ts for the formatRetryAt pattern.
//
// TODO(impl): docs/design/04-booking-and-scheduling.md

export function formatRetryAt(_retryAfterSeconds: number): string {
  throw new Error("TODO(impl): docs/design/04-booking-and-scheduling.md");
}

export function formatSessionTime(_isoTimestamp: string): string {
  throw new Error("TODO(impl): docs/design/04-booking-and-scheduling.md");
}
