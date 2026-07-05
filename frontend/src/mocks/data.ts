// In-memory fake dataset for MSW handlers (src/mocks/handlers.ts) -- see
// docs/design/14-admin-mockup.md's "Fake data conventions". Mutated by
// mock POST/PATCH handlers so the mockup feels alive across a session;
// resets on a full page reload, which is fine (even desirable) for a
// mockup. Every sample record is unmistakably fake: "SAMPLE " name
// prefixes, 555-01xx phone numbers, @example.com emails.
//
// Field names mirror docs/design/03-database.md's table columns
// (snake_case), matching the real backend JSON convention already used by
// src/api/invoices.ts and src/api/bookings.ts -- so a handler graduating
// to a real endpoint changes nothing about the shape.

import { businessLegalName, businessShortName } from "../lib/brand";

// Mirrors the `courses` table (docs/design/03-database.md).
export interface MockCourse {
  id: string;
  slug: string;
  kind: "law_cert" | "technique" | "private";
  title: string;
  summary: string;
  price: string;
  deposit: string;
  duration_min: number;
  default_capacity: number;
  is_active: boolean;
}

// Mirrors the `class_sessions` table (docs/design/03-database.md).
export interface MockSession {
  id: string;
  course_id: string;
  starts_at: string;
  ends_at: string;
  location_name: string;
  location_addr: string;
  capacity: number;
  status: "draft" | "published" | "full" | "completed" | "cancelled";
  notes: string;
}

// Mirrors the `students` table (docs/design/03-database.md).
export interface MockStudent {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  notes: string;
}

// Mirrors the `bookings` table (docs/design/03-database.md).
export interface MockBooking {
  id: string;
  session_id: string;
  student_id: string;
  party_size: number;
  status: "confirmed" | "cancelled" | "attended" | "no_show";
  invoice_id: string | null;
}

// Mirrors the `waitlist_entries` table (docs/design/03-database.md).
export interface MockWaitlistEntry {
  id: string;
  session_id: string;
  student_id: string;
  party_size: number;
  notified_at: string | null;
}

// Mirrors the `waivers` table (docs/design/03-database.md).
export interface MockWaiver {
  id: string;
  student_id: string;
  session_id: string | null;
  template_version: string;
  file_key: string;
  content_type: string;
  uploaded_at: string;
}

// Mirrors `invoice_line_items` (docs/design/03-database.md /
// docs/design/05-payments-and-invoicing.md).
export interface MockInvoiceLineItem {
  id: string;
  description: string;
  amount: string;
}

// Mirrors the `payments` table (docs/design/05-payments-and-invoicing.md).
export interface MockPayment {
  id: string;
  method: "cash" | "card_reader" | "zelle" | "other";
  amount: string;
  recorded_at: string;
  note: string;
}

// Mirrors the `invoices` table (docs/design/05-payments-and-invoicing.md),
// with student_id per docs/design/03's melpino-specific deviation from
// logand.app's customer_id.
export interface MockInvoice {
  id: string;
  student_id: string;
  session_id: string | null;
  status: "unpaid" | "partial" | "paid";
  amount_due: string;
  amount_paid: string;
  line_items: MockInvoiceLineItem[];
  payments: MockPayment[];
}

// Business identity/config surfaced (display-only) on /admin/settings --
// real source of truth is AppConfig, see docs/design/00-overview.md and
// src/lib/brand.ts.
export interface MockSettings {
  business_legal_name: string;
  business_short_name: string;
  default_class_capacity: number;
  email_reminders_enabled: boolean;
  sms_reminders_enabled: boolean;
}

export const courses: MockCourse[] = [
  {
    id: "course-ccw",
    slug: "concealed-carry-certification",
    kind: "law_cert",
    title: "SAMPLE Concealed Carry Certification",
    summary: "SAMPLE classroom law class + sim-gun demo.",
    price: "150.00",
    deposit: "25.00",
    duration_min: 240,
    default_capacity: 12,
    is_active: true,
  },
  {
    id: "course-defensive-handgun",
    slug: "defensive-handgun-fundamentals",
    kind: "technique",
    title: "SAMPLE Defensive Handgun Fundamentals",
    summary: "SAMPLE group range/technique class.",
    price: "120.00",
    deposit: "0.00",
    duration_min: 180,
    default_capacity: 8,
    is_active: true,
  },
  {
    id: "course-private-1on1",
    slug: "private-one-on-one",
    kind: "private",
    title: "SAMPLE Private 1-on-1 Instruction",
    summary: "SAMPLE premium 1:1 instruction slot.",
    price: "225.00",
    deposit: "50.00",
    duration_min: 90,
    default_capacity: 1,
    is_active: true,
  },
];

export const sessions: MockSession[] = [
  {
    id: "session-1",
    course_id: "course-ccw",
    starts_at: "2026-08-01T14:00:00Z",
    ends_at: "2026-08-01T18:00:00Z",
    location_name: "SAMPLE Range, Clearwater",
    location_addr: "123 SAMPLE Range Rd, Clearwater, FL",
    capacity: 12,
    status: "published",
    notes: "SAMPLE notes: bring photo ID.",
  },
  {
    id: "session-2",
    course_id: "course-ccw",
    starts_at: "2026-08-08T14:00:00Z",
    ends_at: "2026-08-08T18:00:00Z",
    location_name: "SAMPLE Range, Clearwater",
    location_addr: "123 SAMPLE Range Rd, Clearwater, FL",
    capacity: 10,
    status: "full",
    notes: "SAMPLE notes: waitlist active.",
  },
  {
    id: "session-3",
    course_id: "course-defensive-handgun",
    starts_at: "2026-08-15T15:00:00Z",
    ends_at: "2026-08-15T18:00:00Z",
    location_name: "SAMPLE Outdoor Range, Tampa",
    location_addr: "456 SAMPLE Range Way, Tampa, FL",
    capacity: 8,
    status: "published",
    notes: "",
  },
  {
    id: "session-4",
    course_id: "course-defensive-handgun",
    starts_at: "2026-08-22T15:00:00Z",
    ends_at: "2026-08-22T18:00:00Z",
    location_name: "SAMPLE Outdoor Range, Tampa",
    location_addr: "456 SAMPLE Range Way, Tampa, FL",
    capacity: 8,
    status: "published",
    notes: "",
  },
  {
    id: "session-5",
    course_id: "course-private-1on1",
    starts_at: "2026-08-10T13:00:00Z",
    ends_at: "2026-08-10T14:30:00Z",
    location_name: "SAMPLE Range, Clearwater",
    location_addr: "123 SAMPLE Range Rd, Clearwater, FL",
    capacity: 1,
    status: "published",
    notes: "SAMPLE notes: 1:1 slot.",
  },
  {
    id: "session-6",
    course_id: "course-ccw",
    starts_at: "2026-07-11T14:00:00Z",
    ends_at: "2026-07-11T18:00:00Z",
    location_name: "SAMPLE Range, Clearwater",
    location_addr: "123 SAMPLE Range Rd, Clearwater, FL",
    capacity: 12,
    status: "completed",
    notes: "SAMPLE notes: completed session, past.",
  },
];

export const students: MockStudent[] = [
  { id: "student-1", full_name: "SAMPLE Jane Doe", email: "jane.doe@example.com", phone: "555-0101", notes: "" },
  { id: "student-2", full_name: "SAMPLE John Q. Public", email: "john.public@example.com", phone: "555-0102", notes: "" },
  { id: "student-3", full_name: "SAMPLE Maria Garcia", email: "maria.garcia@example.com", phone: "555-0103", notes: "" },
  { id: "student-4", full_name: "SAMPLE Robert Smith", email: "robert.smith@example.com", phone: "555-0104", notes: "" },
  { id: "student-5", full_name: "SAMPLE Linda Nguyen", email: "linda.nguyen@example.com", phone: "555-0105", notes: "" },
  { id: "student-6", full_name: "SAMPLE David Kim", email: "david.kim@example.com", phone: "555-0106", notes: "" },
  { id: "student-7", full_name: "SAMPLE Susan Brown", email: "susan.brown@example.com", phone: "555-0107", notes: "" },
  { id: "student-8", full_name: "SAMPLE Michael Davis", email: "michael.davis@example.com", phone: "555-0108", notes: "" },
  { id: "student-9", full_name: "SAMPLE Patricia Wilson", email: "patricia.wilson@example.com", phone: "555-0109", notes: "" },
  { id: "student-10", full_name: "SAMPLE James Moore", email: "james.moore@example.com", phone: "555-0110", notes: "" },
  { id: "student-11", full_name: "SAMPLE Karen Taylor", email: "karen.taylor@example.com", phone: "555-0111", notes: "" },
  { id: "student-12", full_name: "SAMPLE Chris Anderson", email: "chris.anderson@example.com", phone: "555-0112", notes: "" },
  { id: "student-13", full_name: "SAMPLE Nancy Thomas", email: "nancy.thomas@example.com", phone: "555-0113", notes: "" },
  { id: "student-14", full_name: "SAMPLE Paul Jackson", email: "paul.jackson@example.com", phone: "555-0114", notes: "" },
  { id: "student-15", full_name: "SAMPLE Betty White", email: "betty.white@example.com", phone: "555-0115", notes: "" },
];

export const bookings: MockBooking[] = [
  { id: "booking-1", session_id: "session-1", student_id: "student-1", party_size: 1, status: "confirmed", invoice_id: "invoice-1" },
  { id: "booking-2", session_id: "session-1", student_id: "student-2", party_size: 2, status: "confirmed", invoice_id: "invoice-2" },
  { id: "booking-3", session_id: "session-1", student_id: "student-3", party_size: 1, status: "confirmed", invoice_id: "invoice-3" },
  { id: "booking-4", session_id: "session-2", student_id: "student-4", party_size: 1, status: "confirmed", invoice_id: "invoice-4" },
  { id: "booking-5", session_id: "session-2", student_id: "student-5", party_size: 1, status: "confirmed", invoice_id: "invoice-5" },
  { id: "booking-6", session_id: "session-3", student_id: "student-6", party_size: 1, status: "confirmed", invoice_id: "invoice-6" },
  { id: "booking-7", session_id: "session-3", student_id: "student-7", party_size: 1, status: "confirmed", invoice_id: null },
  { id: "booking-8", session_id: "session-5", student_id: "student-8", party_size: 1, status: "confirmed", invoice_id: "invoice-7" },
  { id: "booking-9", session_id: "session-6", student_id: "student-9", party_size: 1, status: "attended", invoice_id: "invoice-8" },
  { id: "booking-10", session_id: "session-6", student_id: "student-10", party_size: 1, status: "no_show", invoice_id: "invoice-9" },
];

export const waitlistEntries: MockWaitlistEntry[] = [
  { id: "waitlist-1", session_id: "session-2", student_id: "student-11", party_size: 1, notified_at: null },
  { id: "waitlist-2", session_id: "session-2", student_id: "student-12", party_size: 2, notified_at: null },
];

export const waivers: MockWaiver[] = [
  { id: "waiver-1", student_id: "student-1", session_id: "session-1", template_version: "2026-01", file_key: "sample-waivers/waiver-1.pdf", content_type: "application/pdf", uploaded_at: "2026-07-20T10:00:00Z" },
  { id: "waiver-2", student_id: "student-2", session_id: "session-1", template_version: "2026-01", file_key: "sample-waivers/waiver-2.pdf", content_type: "application/pdf", uploaded_at: "2026-07-21T10:00:00Z" },
  { id: "waiver-3", student_id: "student-4", session_id: "session-2", template_version: "2026-01", file_key: "sample-waivers/waiver-3.pdf", content_type: "application/pdf", uploaded_at: "2026-07-22T10:00:00Z" },
  { id: "waiver-4", student_id: "student-9", session_id: "session-6", template_version: "2025-11", file_key: "sample-waivers/waiver-4.pdf", content_type: "application/pdf", uploaded_at: "2026-07-01T10:00:00Z" },
  // student-3 and others deliberately have no waiver on file, so the
  // Waivers screen's "missing a waiver" filter has something to show.
];

export const invoices: MockInvoice[] = [
  {
    id: "invoice-1",
    student_id: "student-1",
    session_id: "session-1",
    status: "paid",
    amount_due: "150.00",
    amount_paid: "150.00",
    line_items: [{ id: "li-1", description: "SAMPLE Concealed Carry Certification -- seat", amount: "150.00" }],
    payments: [{ id: "payment-1", method: "card_reader", amount: "150.00", recorded_at: "2026-07-15T16:00:00Z", note: "" }],
  },
  {
    id: "invoice-2",
    student_id: "student-2",
    session_id: "session-1",
    status: "partial",
    amount_due: "300.00",
    amount_paid: "25.00",
    line_items: [
      { id: "li-2", description: "SAMPLE Concealed Carry Certification -- seat x2", amount: "300.00" },
    ],
    payments: [{ id: "payment-2", method: "zelle", amount: "25.00", recorded_at: "2026-07-10T09:00:00Z", note: "Manual Zelle deposit, screenshot on file" }],
  },
  {
    id: "invoice-3",
    student_id: "student-3",
    session_id: "session-1",
    status: "unpaid",
    amount_due: "150.00",
    amount_paid: "0.00",
    line_items: [{ id: "li-3", description: "SAMPLE Concealed Carry Certification -- seat", amount: "150.00" }],
    payments: [],
  },
  {
    id: "invoice-4",
    student_id: "student-4",
    session_id: "session-2",
    status: "paid",
    amount_due: "150.00",
    amount_paid: "150.00",
    line_items: [{ id: "li-4", description: "SAMPLE Concealed Carry Certification -- seat", amount: "150.00" }],
    payments: [{ id: "payment-3", method: "cash", amount: "150.00", recorded_at: "2026-07-18T12:00:00Z", note: "" }],
  },
  {
    id: "invoice-5",
    student_id: "student-5",
    session_id: "session-2",
    status: "unpaid",
    amount_due: "150.00",
    amount_paid: "0.00",
    line_items: [{ id: "li-5", description: "SAMPLE Concealed Carry Certification -- seat", amount: "150.00" }],
    payments: [],
  },
  {
    id: "invoice-6",
    student_id: "student-6",
    session_id: "session-3",
    status: "paid",
    amount_due: "120.00",
    amount_paid: "120.00",
    line_items: [{ id: "li-6", description: "SAMPLE Defensive Handgun Fundamentals -- seat", amount: "120.00" }],
    payments: [{ id: "payment-4", method: "card_reader", amount: "120.00", recorded_at: "2026-07-19T11:00:00Z", note: "" }],
  },
  {
    id: "invoice-7",
    student_id: "student-8",
    session_id: "session-5",
    status: "partial",
    amount_due: "225.00",
    amount_paid: "50.00",
    line_items: [{ id: "li-7", description: "SAMPLE Private 1-on-1 Instruction -- deposit", amount: "225.00" }],
    payments: [{ id: "payment-5", method: "zelle", amount: "50.00", recorded_at: "2026-07-22T14:00:00Z", note: "Manual Zelle deposit" }],
  },
  {
    id: "invoice-8",
    student_id: "student-9",
    session_id: "session-6",
    status: "paid",
    amount_due: "150.00",
    amount_paid: "150.00",
    line_items: [{ id: "li-8", description: "SAMPLE Concealed Carry Certification -- seat", amount: "150.00" }],
    payments: [{ id: "payment-6", method: "cash", amount: "150.00", recorded_at: "2026-07-11T16:00:00Z", note: "" }],
  },
  {
    id: "invoice-9",
    student_id: "student-10",
    session_id: "session-6",
    status: "unpaid",
    amount_due: "150.00",
    amount_paid: "0.00",
    line_items: [{ id: "li-9", description: "SAMPLE Concealed Carry Certification -- seat (no-show)", amount: "150.00" }],
    payments: [],
  },
];

export const settings: MockSettings = {
  // Interpolated from lib/brand.ts -- doc 00's business-identity rule
  // applies to mock data too (the Settings screen displays these).
  business_legal_name: businessLegalName,
  business_short_name: businessShortName,
  default_class_capacity: 12,
  email_reminders_enabled: true,
  sms_reminders_enabled: false,
};
