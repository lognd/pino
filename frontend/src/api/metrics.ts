// Owner metrics -- bookings split by origin (site vs manual entry), the
// numbers the site owner's fee arrangement is keyed to. Backend:
// api/admin_metrics.py; answered by MSW during the mockup phase.

import { apiGet } from "./client";

export interface SourceCount {
  bookings: number;
  seats: number;
}

export interface BookingsBySource {
  totals: { web: SourceCount; admin: SourceCount };
  monthly: { month: string; web: SourceCount; admin: SourceCount }[];
}

export function fetchBookingsBySource(): Promise<BookingsBySource> {
  return apiGet<BookingsBySource>("/api/admin/metrics/bookings-by-source");
}
