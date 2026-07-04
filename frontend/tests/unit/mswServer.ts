// Shared msw/node test server for admin mockup unit tests -- docs/design/
// 14-admin-mockup.md's "unit tests (mockup components)" obligation: each
// mockup screen test renders against MSW using the exact handlers the
// browser build uses (src/mocks/handlers.ts), so the same test keeps
// passing across graduation (only the handler is deleted, not the test's
// assertions about the component's own behavior).

import { setupServer } from "msw/node";
import { handlers } from "../../src/mocks/handlers";

export const server = setupServer(...handlers);
