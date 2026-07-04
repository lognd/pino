import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminDashboard } from "../../src/app/routes/admin/Dashboard";

// docs/design/14-admin-mockup.md's test obligations: each mockup screen
// renders with MSW active and shows sample data; every screen renders the
// MOCKUP -- SAMPLE DATA banner.
function renderDashboard() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminDashboard (mockup screen)", () => {
  it("renders sample upcoming sessions from mocks/data.ts via MSW", async () => {
    renderDashboard();
    expect(await screen.findByText(/SAMPLE/)).toBeInTheDocument();
    expect((await screen.findAllByText(/unpaid invoice/i)).length).toBeGreaterThan(0);
  });

  it("renders the MOCKUP -- SAMPLE DATA banner", async () => {
    renderDashboard();
    expect(await screen.findByRole("status")).toHaveTextContent("MOCKUP -- SAMPLE DATA");
  });
});
