import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LegalPage } from "../../src/app/routes/public/LegalPage";
import { CONTENT } from "../../src/content/mock";

function renderLegalPage(page: string) {
  return render(
    <MemoryRouter initialEntries={[`/legal/${page}`]}>
      <Routes>
        <Route path="/legal/:page" element={<LegalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LegalPage", () => {
  for (const entry of CONTENT.legalPages) {
    it(`renders the SAMPLE banner for /legal/${entry.slug}`, () => {
      renderLegalPage(entry.slug);
      expect(screen.getByText(entry.sampleNotice)).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: entry.title })).toBeInTheDocument();
    });
  }

  it("renders a not-found fallback for an unknown page slug", () => {
    renderLegalPage("not-a-real-page");
    expect(screen.getByText("We could not find that page")).toBeInTheDocument();
  });
});
