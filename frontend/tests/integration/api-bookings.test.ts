import { describe, it } from "vitest";

// docs/design/12-testing-strategy.md's frontend integration obligations.
describe("api/bookings.ts against a real test backend", () => {
  it.todo("createBooking() returns a manage_token usable by fetchBookingByToken()");
  it.todo("cancelBookingByToken() flips status to cancelled and frees the seat");
});
