import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Pay } from "../../src/app/routes/public/Pay";
import { CONTENT } from "../../src/content/mock";

// docs/design/05-payments-and-invoicing.md's pay-by-link page. Stubs
// global fetch directly (not MSW -- see api/pay.ts's own tests for why)
// so each test controls exactly what /api/pay/{token} answers.
function renderPay(initialPath: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/pay/:token" element={<Pay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("Pay page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a friendly not-found state for a wrong/expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ detail: { detail: "invoice not found", code: "InvoiceError.NotFound" } }, 404),
      ),
    );
    renderPay("/pay/does-not-exist");

    expect(await screen.findByText(CONTENT.pay.notFoundHeading)).toBeInTheDocument();
    expect(screen.getByText(CONTENT.pay.notFoundNote)).toBeInTheDocument();
    expect(document.querySelector('a[href^="tel:"]')).toBeTruthy();
  });

  it("shows the paid state with no pay buttons once status is paid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          invoice_id: "inv-1",
          status: "paid",
          amount_total: "50.00",
          amount_due: "0.00",
          currency: "usd",
          payment_methods: { stripe: true, paypal: false, zelle_handle: null },
        }),
      ),
    );
    renderPay("/pay/tok-paid");

    expect(await screen.findByText(CONTENT.pay.paidHeading)).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: CONTENT.pay.cardCta })).not.toBeInTheDocument();
  });

  it("offers card/paypal/zelle methods only per what payment-methods reports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          invoice_id: "inv-2",
          status: "sent",
          amount_total: "80.00",
          amount_due: "80.00",
          currency: "usd",
          payment_methods: { stripe: true, paypal: true, zelle_handle: "mel@zelle" },
        }),
      ),
    );
    renderPay("/pay/tok-open");

    expect(await screen.findByRole("button", { name: CONTENT.pay.cardCta })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONTENT.pay.paypalCta })).toBeInTheDocument();
    expect(screen.getByText("mel@zelle")).toBeInTheDocument();
    expect(screen.getByText(CONTENT.pay.inPersonHeading)).toBeInTheDocument();
  });

  it("hides the paypal button when paypal is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          invoice_id: "inv-3",
          status: "sent",
          amount_total: "80.00",
          amount_due: "80.00",
          currency: "usd",
          payment_methods: { stripe: true, paypal: false, zelle_handle: null },
        }),
      ),
    );
    renderPay("/pay/tok-nopaypal");

    await screen.findByRole("button", { name: CONTENT.pay.cardCta });
    expect(screen.queryByRole("button", { name: CONTENT.pay.paypalCta })).not.toBeInTheDocument();
  });

  it("shows the TODO(P7) card panel (never a raw client_secret) after starting a card payment", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/stripe-intent")) {
        return jsonResponse({ client_secret: "secret_super_sensitive" });
      }
      return jsonResponse({
        invoice_id: "inv-4",
        status: "sent",
        amount_total: "80.00",
        amount_due: "80.00",
        currency: "usd",
        payment_methods: { stripe: true, paypal: false, zelle_handle: null },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPay("/pay/tok-card");
    await user.click(await screen.findByRole("button", { name: CONTENT.pay.cardCta }));

    expect(await screen.findByText(CONTENT.pay.cardStartedHeading)).toBeInTheDocument();
    expect(screen.getByText(CONTENT.pay.cardStartedNote)).toBeInTheDocument();
    expect(screen.queryByText("secret_super_sensitive")).not.toBeInTheDocument();
  });

  it("redirects to PayPal's approval_url on successful order creation", async () => {
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    // @ts-expect-error -- test-only stub of window.location.assign
    delete window.location;
    // @ts-expect-error -- partial Location stub is fine for this assertion
    window.location = { ...originalLocation, assign: assignSpy };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/paypal-order")) {
        return jsonResponse({ order_id: "order-9", approval_url: "https://paypal.example/approve" });
      }
      return jsonResponse({
        invoice_id: "inv-5",
        status: "sent",
        amount_total: "80.00",
        amount_due: "80.00",
        currency: "usd",
        payment_methods: { stripe: true, paypal: true, zelle_handle: null },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderPay("/pay/tok-paypal");
    await user.click(await screen.findByRole("button", { name: CONTENT.pay.paypalCta }));

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("https://paypal.example/approve"));
    // @ts-expect-error -- restoring the test-only stub above
    window.location = originalLocation;
  });

  it("captures a paypal payment on ?token= return and shows success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "succeeded" })),
    );
    renderPay("/pay/tok-return?token=order-return-1");

    expect(await screen.findByText(CONTENT.pay.paypalSucceededNote)).toBeInTheDocument();
  });
});
