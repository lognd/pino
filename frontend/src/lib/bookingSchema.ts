// Zod schema for the /book flow's step-2 "your details" form -- mirrors
// backend validation (melpino_backend/domain/booking/service.py's
// create_booking checks + api/bookings.py's BookingCreateRequest) so a
// guest sees the same plain-English rejection client-side that the
// server would otherwise return. See docs/design/04-booking-and-
// scheduling.md's "Frontend booking flow" contract.

import { z } from "zod";
import { CONTENT } from "../content/mock";

const { errors } = CONTENT.booking;

// Loose on purpose -- digits, spaces, parens, dashes, a leading "+", at
// least 7 digits total. Real E.164 validation is not this form's job;
// the backend does not validate phone format at all (it is optional and
// free-text), so this is a courtesy check only.
const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/;

export const bookingDetailsSchema = z.object({
  fullName: z.string().trim().min(1, errors.nameRequired),
  email: z.string().trim().min(1, errors.emailInvalid).email(errors.emailInvalid),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || PHONE_RE.test(value), { message: errors.phoneInvalid }),
  // Mirrors backend/domain/booking/service.py::create_booking's
  // `party_size < 1` rejection (BookingError.PartySizeInvalid); the
  // Stepper component's own max=10 default caps the upper end in the UI.
  partySize: z.number().int().min(1, errors.partySizeInvalid),
  // Mirrors create_booking's `attestation_accepted` check
  // (BookingError.AttestationRequired) -- literal(true) rejects false/undefined.
  attestationAccepted: z.literal(true, { message: errors.attestationRequired }),
  smsConsent: z.boolean(),
  // Honeypot: humans never see or fill this field (visually hidden in
  // the DOM); a bot's form-filler typically fills every input it finds.
  honeypotField: z.string().optional(),
});

export type BookingDetailsFormValues = z.infer<typeof bookingDetailsSchema>;
