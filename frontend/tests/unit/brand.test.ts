import { describe, it } from "vitest";

// docs/design/12-testing-strategy.md's frontend unit obligations:
// "brand.ts interpolation".
describe("lib/brand.ts", () => {
  it.todo("defaults businessLegalName/businessShortName when env vars are unset");
  it.todo("reads VITE_BUSINESS_LEGAL_NAME/VITE_BUSINESS_SHORT_NAME when set");
});
