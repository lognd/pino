import { describe, expect, it } from "vitest";
import { bookingDetailsSchema } from "../../src/lib/bookingSchema";
import { nextStep, prevStep, stepNumber, formatSeatsOpen } from "../../src/lib/booking";
import { formatRetryAt, formatSessionTime } from "../../src/lib/time";

// docs/design/12-testing-strategy.md's frontend unit obligations:
// "booking-flow field validation (zod mirrors backend)" -- mirrors
// backend/domain/booking/service.py::create_booking's rejections
// (BookingError.PartySizeInvalid, .AttestationRequired) plus the shape
// checks api/bookings.py's BookingCreateRequest implies.
describe("bookingDetailsSchema", () => {
  const validBase = {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "",
    partySize: 1,
    attestationAccepted: true as const,
    smsConsent: false,
    honeypotField: "",
  };

  it("accepts a fully valid submission", () => {
    const result = bookingDetailsSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("rejects an empty guest name", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, fullName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed guest email", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed guest phone number", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, phone: "abc" });
    expect(result.success).toBe(false);
  });

  it("accepts a blank phone number (optional field)", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, phone: "" });
    expect(result.success).toBe(true);
  });

  it("accepts a plausible phone number", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, phone: "(555) 010-0100" });
    expect(result.success).toBe(true);
  });

  it("rejects party size below 1, mirroring BookingError.PartySizeInvalid", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, partySize: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects an unaccepted attestation, mirroring BookingError.AttestationRequired", () => {
    const result = bookingDetailsSchema.safeParse({ ...validBase, attestationAccepted: false });
    expect(result.success).toBe(false);
  });
});

describe("book flow step navigation", () => {
  it("advances pick -> details -> confirm -> confirmed", () => {
    expect(nextStep("pick")).toBe("details");
    expect(nextStep("details")).toBe("confirm");
    expect(nextStep("confirm")).toBe("confirmed");
  });

  it("does not advance past confirmed", () => {
    expect(nextStep("confirmed")).toBe("confirmed");
  });

  it("goes backwards confirm -> details -> pick", () => {
    expect(prevStep("confirm")).toBe("details");
    expect(prevStep("details")).toBe("pick");
  });

  it("does not go backwards past pick, or backwards out of confirmed", () => {
    expect(prevStep("pick")).toBe("pick");
    expect(prevStep("confirmed")).toBe("confirmed");
  });

  it("reports 1-based step numbers, with confirmed still reporting 3", () => {
    expect(stepNumber("pick")).toBe(1);
    expect(stepNumber("details")).toBe(2);
    expect(stepNumber("confirm")).toBe(3);
    expect(stepNumber("confirmed")).toBe(3);
  });
});

describe("formatSeatsOpen", () => {
  it("renders the plain-words seat count", () => {
    expect(formatSeatsOpen(4, 10)).toBe("4 of 10 seats open");
  });

  it("renders zero seats open plainly too", () => {
    expect(formatSeatsOpen(0, 10)).toBe("0 of 10 seats open");
  });
});

describe("formatRetryAt", () => {
  it("says you can try again now at zero seconds", () => {
    expect(formatRetryAt(0)).toBe("You can try again now.");
  });

  it("formats a singular second", () => {
    expect(formatRetryAt(1)).toBe("Please try again in 1 second.");
  });

  it("formats plural seconds under a minute", () => {
    expect(formatRetryAt(47)).toBe("Please try again in 47 seconds.");
  });

  it("formats minutes at and above 60 seconds", () => {
    expect(formatRetryAt(60)).toBe("Please try again in 1 minute.");
    expect(formatRetryAt(125)).toBe("Please try again in 3 minutes.");
  });
});

describe("formatSessionTime", () => {
  it("returns a fallback string for an invalid timestamp", () => {
    expect(formatSessionTime("not-a-date")).toBe("Date unavailable");
  });

  it("formats a valid ISO timestamp without throwing", () => {
    const formatted = formatSessionTime("2026-08-01T13:00:00Z");
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });
});
