// Course catalog + session reads -- docs/design/04-booking-and-scheduling.md's
// public API surface (GET /api/courses, /api/courses/{slug},
// /api/courses/{slug}/sessions). Types come straight from the generated
// OpenAPI schema (docs/design/07's type-sharing rule) since these three
// response shapes are real pydantic response_models on the backend.

import { apiGet } from "./client";
import type { components } from "../types/api.generated";

export type CourseCard = components["schemas"]["CourseCard"];
export type CourseDetail = components["schemas"]["CourseDetail"];
export type SessionCard = components["schemas"]["SessionCard"];

/** GET /api/courses -- active courses w/ card fields for the catalog grid. */
export function fetchCourses(): Promise<CourseCard[]> {
  return apiGet<CourseCard[]>("/api/courses");
}

/** GET /api/courses/{slug} -- full course detail (adds long-form description). */
export function fetchCourse(slug: string): Promise<CourseDetail> {
  return apiGet<CourseDetail>(`/api/courses/${encodeURIComponent(slug)}`);
}

/** GET /api/courses/{slug}/sessions -- published+full future sessions
 * (full ones are still listed so the UI can offer a waitlist). */
export function fetchCourseSessions(slug: string): Promise<SessionCard[]> {
  return apiGet<SessionCard[]>(`/api/courses/${encodeURIComponent(slug)}/sessions`);
}
