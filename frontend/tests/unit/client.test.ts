import { describe, it } from "vitest";

// docs/design/12-testing-strategy.md's frontend integration obligations
// (CSRF attach on admin mutations, 429 countdown surfacing, `code`-field
// branching) start as unit-level contract tests here; real integration
// tests against the test backend live in tests/integration/.
describe("api/client.ts", () => {
  it.todo("attaches X-CSRF-Token on mutating admin requests");
  it.todo("throws RateLimitedError with retryAfterSeconds on a 429");
  it.todo("throws ApiError with the backend's machine-readable code field");
});
