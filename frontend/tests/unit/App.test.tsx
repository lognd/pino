import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Hero internals belong to another agent (src/hero/**); mock it here so
// App's route-table smoke test never touches its implementation.
vi.mock("../../src/hero/Hero", () => ({
  Hero: () => <div data-testid="hero-stub" />,
}));

import { App } from "../../src/App";

// docs/design/07-frontend-architecture.md's route table -- a broad smoke
// render that every public route mounts under Shell without throwing.
describe("App route table", () => {
  it.each(["/", "/courses", "/about", "/contact", "/book", "/legal/privacy"])(
    "renders %s without throwing",
    async (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );
      // Shell's nav is present on every route.
      expect(await screen.findByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    },
  );
});
