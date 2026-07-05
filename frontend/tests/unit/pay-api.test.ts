import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capturePaypalOrder,
  checkPaymentMethods,
  createPaypalOrder,
  createStripeIntent,
  fetchInvoiceSummary,
  isProofUploadUnavailable,
  PAYABLE_STATUSES,
  PAYMENT_PROOF_CONTENT_TYPES,
  uploadPaymentProof,
} from "../../src/api/pay";
import { ApiError } from "../../src/api/client";

// docs/design/05-payments-and-invoicing.md's guest pay-by-link surface --
// contract tests mirroring api/client.test.ts's pattern of stubbing
// global fetch directly (see that file's own header note on why this
// isn't MSW-based).
describe("api/pay.ts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the invoice summary via GET /api/pay/{token}", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            invoice_id: "inv-1",
            status: "sent",
            amount_total: "100.00",
            amount_due: "50.00",
            currency: "usd",
            payment_methods: { stripe: true, paypal: false, zelle_handle: null },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await fetchInvoiceSummary("tok-1");
    expect(summary.amount_due).toBe("50.00");
    expect(summary.payment_methods.stripe).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pay/tok-1");
  });

  it("does not attach X-CSRF-Token on pay-token routes (guest, no session)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ client_secret: "secret_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createStripeIntent("tok-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string> | undefined)?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("checks payment methods via POST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ stripe: false, paypal: true, zelle_handle: "mel@zelle" }), {
            status: 200,
          }),
      ),
    );
    const methods = await checkPaymentMethods("tok-1");
    expect(methods.paypal).toBe(true);
    expect(methods.zelle_handle).toBe("mel@zelle");
  });

  it("creates a stripe intent and returns client_secret verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ client_secret: "secret_abc" }), { status: 200 })),
    );
    const result = await createStripeIntent("tok-1");
    expect(result.client_secret).toBe("secret_abc");
  });

  it("creates a paypal order with order_id/approval_url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ order_id: "order-1", approval_url: "https://paypal.example/approve" }),
            { status: 200 },
          ),
      ),
    );
    const order = await createPaypalOrder("tok-1");
    expect(order.order_id).toBe("order-1");
    expect(order.approval_url).toBe("https://paypal.example/approve");
  });

  it("captures a paypal order at the correct nested path", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: "succeeded" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await capturePaypalOrder("tok-1", "order-1");
    expect(result.status).toBe("succeeded");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pay/tok-1/paypal-order/order-1/capture");
  });

  it("uploads payment proof as multipart form data", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "proof-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["fake"], "proof.png", { type: "image/png" });
    const result = await uploadPaymentProof("tok-1", file);
    expect(result.id).toBe("proof-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("treats a real invoice 404 (from to_http_exception) as ApiError with a code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ detail: { detail: "invoice not found", code: "InvoiceError.NotFound" } }),
            { status: 404 },
          ),
      ),
    );
    try {
      await fetchInvoiceSummary("bad-token");
      expect.unreachable("expected fetchInvoiceSummary to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("InvoiceError.NotFound");
      expect(isProofUploadUnavailable(err)).toBe(false);
    }
  });

  it("treats a route-not-found 404 (no code) as proof-upload-unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })));
    try {
      await uploadPaymentProof("tok-1", new File(["x"], "x.png", { type: "image/png" }));
      expect.unreachable("expected uploadPaymentProof to throw");
    } catch (err) {
      expect(isProofUploadUnavailable(err)).toBe(true);
    }
  });

  it("exposes the payable-status set and content-type allowlist doc 05 relies on", () => {
    expect(PAYABLE_STATUSES.has("sent")).toBe(true);
    expect(PAYABLE_STATUSES.has("overdue")).toBe(true);
    expect(PAYABLE_STATUSES.has("paid")).toBe(false);
    expect(PAYMENT_PROOF_CONTENT_TYPES).toContain("image/png");
    expect(PAYMENT_PROOF_CONTENT_TYPES).toContain("application/pdf");
  });
});
