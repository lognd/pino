import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCalendar } from "../../src/app/routes/admin/Calendar";
import { AdminLogs } from "../../src/app/routes/admin/Logs";
import { AdminDashboard } from "../../src/app/routes/admin/Dashboard";

// docs/design/14-admin-mockup.md test obligations for the new screens:
// calendar month grid + ICS subscribe box, the logs portal, and the
// dashboard's bookings-by-source billing tile -- all fed by MSW.

function renderPage(page: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminCalendar (mockup screen)", () => {
  it("renders the month grid with weekday headers", async () => {
    renderPage(<AdminCalendar />);
    expect(await screen.findByRole("status")).toHaveTextContent("MOCKUP -- SAMPLE DATA");
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("shows the Google Calendar subscribe box with the feed URL", async () => {
    renderPage(<AdminCalendar />);
    expect(await screen.findByText(/Sync to Google Calendar/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/feed\.ics\?key=SAMPLE-FEED-KEY/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });
});

describe("AdminLogs (mockup screen)", () => {
  it("tails the server log and renders parsed lines", async () => {
    renderPage(<AdminLogs />);
    expect(
      await screen.findByText(/application startup complete/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ERROR").length).toBeGreaterThan(0);
  });

  it("lists downloadable log files", async () => {
    renderPage(<AdminLogs />);
    const link = await screen.findByRole("link", { name: "app.log" });
    expect(link).toHaveAttribute("href", "/api/admin/logs/files/app.log");
  });
});

describe("AdminDashboard bookings-by-source tile", () => {
  it("shows the web vs manual split from the mock bookings", async () => {
    renderPage(<AdminDashboard />);
    expect(await screen.findByText(/Bookings by source/i)).toBeInTheDocument();
    expect(screen.getByText(/Booked on the site/i)).toBeInTheDocument();
    expect(screen.getByText(/Entered manually/i)).toBeInTheDocument();
  });
});
