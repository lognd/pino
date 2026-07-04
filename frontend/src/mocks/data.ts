// In-memory fake dataset for MSW handlers (src/mocks/handlers.ts) -- see
// docs/design/14-admin-mockup.md's "Fake data conventions". Mutated by
// mock POST/PATCH handlers so the mockup feels alive across a session;
// resets on a full page reload, which is fine (even desirable) for a
// mockup. Every sample record is unmistakably fake: "SAMPLE " name
// prefixes, 555-01xx phone numbers, @example.com emails.
//
// TODO(impl): docs/design/14-admin-mockup.md -- expand with sessions,
// invoices, waivers per the route list once the screens are built.

export interface MockStudent {
  id: string;
  name: string;
  email: string;
  phone: string;
  completed_courses: string[];
}

export interface MockSession {
  id: string;
  course_slug: string;
  starts_at: string;
  capacity: number;
  enrolled_student_ids: string[];
  waitlisted_student_ids: string[];
}

export const students: MockStudent[] = [
  {
    id: "student-1",
    name: "SAMPLE Jane Doe",
    email: "jane.doe@example.com",
    phone: "555-0101",
    completed_courses: ["concealed-carry-certification"],
  },
];

export const sessions: MockSession[] = [
  {
    id: "session-1",
    course_slug: "concealed-carry-certification",
    starts_at: "2026-08-01T14:00:00Z",
    capacity: 12,
    enrolled_student_ids: ["student-1"],
    waitlisted_student_ids: [],
  },
];
