// Guest booking flow -- 3-step booking, manage-booking signed links, no
// accounts. See docs/design/04-booking-and-scheduling.md. CRIB:
// logand.app/frontend/src/api/customers.ts for request/response typing
// conventions; the guest-token-in-URL-only pattern is melpino-specific
// (docs/design/02) and has no logand.app equivalent to crib directly.
//
// TODO(impl): docs/design/04-booking-and-scheduling.md

import { apiGet, apiPost } from "./client";

export interface BookingRequest {
  course_slug: string;
  session_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
}

export interface Booking {
  id: string;
  manage_token: string;
  status: "pending" | "confirmed" | "waitlisted" | "cancelled";
}

export function createBooking(_request: BookingRequest): Promise<Booking> {
  throw new Error("TODO(impl): docs/design/04-booking-and-scheduling.md");
}

export function fetchBookingByToken(_token: string): Promise<Booking> {
  return apiGet<Booking>(`/api/bookings/manage/${_token}`);
}

export function cancelBookingByToken(_token: string): Promise<Booking> {
  return apiPost<Booking>(`/api/bookings/manage/${_token}/cancel`);
}
