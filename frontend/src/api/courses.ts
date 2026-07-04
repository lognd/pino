// Course catalog reads -- docs/design/10-seo-and-content.md section 2.
// CRIB: logand.app/frontend/src/api/customers.ts for the fetch-list /
// fetch-detail shape convention (one file per backend feature).
//
// TODO(impl): docs/design/10-seo-and-content.md

import { apiGet } from "./client";

export interface Course {
  slug: string;
  name: string;
  short_description: string;
  price_label: string;
}

export function fetchCourses(): Promise<Course[]> {
  return apiGet<Course[]>("/api/courses");
}

export function fetchCourse(_slug: string): Promise<Course> {
  throw new Error("TODO(impl): docs/design/10-seo-and-content.md");
}
