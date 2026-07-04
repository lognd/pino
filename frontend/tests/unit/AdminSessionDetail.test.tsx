import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSessionDetail } from "../../src/app/routes/admin/SessionDetail";

// docs/design/14-admin-mockup.md's test obligations: each mockup screen
// renders with MSW active and shows sample data; every screen renders the
// MOCKUP -- SAMPLE DATA banner. session-2 (mocks/data.ts) has both a
// roster and a waitlist, exercising both sections.
function renderSessionDetail(sessionId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/schedule/${sessionId}`]}>
        <Routes>
          <Route path="/admin/schedule/:sessionId" element={<AdminSessionDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminSessionDetail (mockup screen)", () => {
  it("renders the roster and waitlist from mocks/data.ts via MSW", async () => {
    renderSessionDetail("session-2");
    expect(await screen.findByText(/SAMPLE Robert Smith/)).toBeInTheDocument();
    expect(await screen.findByText(/SAMPLE Karen Taylor/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Promote to roster" }).length).toBeGreaterThan(0);
  });

  it("renders the MOCKUP -- SAMPLE DATA banner", async () => {
    renderSessionDetail("session-2");
    expect(await screen.findByRole("status")).toHaveTextContent("MOCKUP -- SAMPLE DATA");
  });
});
