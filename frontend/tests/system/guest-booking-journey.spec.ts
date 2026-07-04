import { test } from "@playwright/test";

// docs/design/12-testing-strategy.md's frontend system obligations:
// "Guest journey: browse courses -> book (attestation checked) ->
// fake-SMTP confirmation link -> manage page -> cancel." and the
// "Full-session path" / "Deposit path" cases.
test.describe("Guest booking journey", () => {
  test.skip("browses courses, books a class, confirms via email link, then cancels", async () => {
    // TODO(impl): docs/design/04-booking-and-scheduling.md
  });
  test.skip("joins a waitlist when a session is full, gets offered a seat on cancel", async () => {
    // TODO(impl): docs/design/04-booking-and-scheduling.md
  });
  test.skip("pays a deposit course via fake-stripe and the invoice shows paid", async () => {
    // TODO(impl): docs/design/05-payments-and-invoicing.md
  });
});
