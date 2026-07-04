import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./unit/mswServer";

// Global MSW node server for the admin mockup's unit tests (docs/design/
// 14-admin-mockup.md) -- started for every unit test file since its
// handlers only intercept /api/admin/* and /api/auth/* paths and are a
// no-op for every other test's requests. `onUnhandledRequest: "bypass"`
// keeps this from interfering with non-admin tests that never touch MSW.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
