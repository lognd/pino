// Guest booking flow -- 3-step booking, manage-booking signed links, no
// accounts. See docs/design/04-booking-and-scheduling.md's public API
// surface and docs/design/02-auth-and-security.md's manage-token/rate-limit
// contract. The guest-token-in-URL-only pattern (never persisted to
// storage) lives entirely in how ManageBooking.tsx/Book.tsx call these
// functions, not in this file.
//
// TODO(types): BookingCreateResponse and BookingDetailResponse are
// hand-typed below (not sourced from api.generated.ts) because
// api/bookings.py's create/manage endpoints are annotated `-> dict` on
// the FastAPI router (model_dump() of a pydantic model, not the model
// itself as the response_model), so openapi-typescript never sees their
// schema. Mirrors melpino_backend/api/bookings.py's BookingCreateResponse
// and BookingDetailResponse pydantic models field-for-field; keep in sync
// by hand until that route annotation is fixed to return the model type.

import { apiGet, apiPost } from "./client";
import type { components } from "../types/api.generated";

export type BookingCreateRequest = components["schemas"]["BookingCreateRequest"];
export type AttestationInput = components["schemas"]["AttestationInput"];

/** What the confirm step needs after POST /api/bookings: the booking id
 * + its private manage URL (also emailed to the guest). */
export interface BookingCreateResponse {
  booking_id: string;
  manage_url: string;
}

/** The manage-page view of one booking, resolved only via its manage
 * token (GET /api/bookings/manage/{token}). */
export interface BookingDetailResponse {
  booking_id: string;
  status: "confirmed" | "cancelled" | "attended" | "no_show" | string;
  party_size: number;
  course_title: string;
  starts_at: string;
  ends_at: string;
  location_name: string;
  location_addr: string;
  can_cancel_online: boolean;
  // TODO(types): api/bookings.py's BookingDetailResponse does not send
  // invoice_id yet (deposit invoicing is P4, docs/design/05) -- this
  // field is a forward-compatible placeholder so ManageBooking.tsx's
  // invoice-link stub can render the moment the backend adds it, with no
  // ManageBooking.tsx change required.
  invoice_id?: string | null;
}

/** POST /api/bookings -- rate-limited 5/hour (RateLimitedError on 429),
 * honeypot-checked (leave `honeypot_field` empty -- a bot fills it). */
export function createBooking(payload: BookingCreateRequest): Promise<BookingCreateResponse> {
  return apiPost<BookingCreateResponse>("/api/bookings", payload);
}

/** POST /api/bookings/waitlist -- same request shape, no payment/seat. */
export function joinWaitlist(payload: BookingCreateRequest): Promise<{ status: string }> {
  return apiPost<{ status: string }>("/api/bookings/waitlist", payload);
}

/** GET /api/bookings/manage/{token} -- rate-limited 30/hour. A wrong,
 * guessed, or expired token all return the SAME 404 (BookingError.TokenInvalid)
 * -- never distinguished, per docs/design/02. */
export function fetchBookingByToken(token: string): Promise<BookingDetailResponse> {
  return apiGet<BookingDetailResponse>(`/api/bookings/manage/${encodeURIComponent(token)}`);
}

/** POST /api/bookings/manage/{token}/cancel. */
export function cancelBookingByToken(token: string): Promise<{ status: string }> {
  return apiPost<{ status: string }>(`/api/bookings/manage/${encodeURIComponent(token)}/cancel`);
}

/** POST /api/bookings/manage/{token}/resend-confirmation. */
export function resendConfirmation(token: string): Promise<{ status: string }> {
  return apiPost<{ status: string }>(
    `/api/bookings/manage/${encodeURIComponent(token)}/resend-confirmation`,
  );
}
