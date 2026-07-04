import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Hero internals belong to another agent and may be mid-flight -- mock the
// module so this test never depends on it, per this build's ownership
// boundary (do not touch src/hero/**).
vi.mock("../../src/hero/Hero", () => ({
  Hero: () => <div data-testid="hero-stub" />,
}));

import { Landing } from "../../src/app/routes/public/Landing";
import { CONTENT } from "../../src/content/mock";
import { businessShortName } from "../../src/lib/brand";

describe("Landing", () => {
  it("renders a real H1 with the business name", async () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    const heading = await screen.findByRole("heading", { level: 1, name: businessShortName });
    expect(heading).toBeInTheDocument();
  });

  it("renders course cards from mock.ts", async () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    for (const course of CONTENT.courses) {
      expect(await screen.findByText(course.name)).toBeInTheDocument();
    }
  });
});
