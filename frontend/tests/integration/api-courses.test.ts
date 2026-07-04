import { describe, it } from "vitest";

// docs/design/12-testing-strategy.md's frontend integration obligations:
// api/ modules exercised against the real test backend (no mocking the
// boundary under test). Requires backend/ running against test
// Postgres/Redis -- see docs/design/03-database.md.
describe("api/courses.ts against a real test backend", () => {
  it.todo("fetchCourses() returns the seeded course catalog");
  it.todo("fetchCourse(slug) 404s in the backend's structured error shape for an unknown slug");
});
