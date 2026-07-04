import { describe, it } from "vitest";

// docs/design/12-testing-strategy.md's frontend unit obligations:
// "booking-flow field validation (zod mirrors backend)".
describe("Book.tsx field validation", () => {
  it.todo("rejects an empty guest name");
  it.todo("rejects a malformed guest email");
  it.todo("rejects a malformed guest phone number");
});
