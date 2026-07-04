import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, ApiError, RateLimitedError } from "../../src/api/client";

// docs/design/12-testing-strategy.md's frontend integration obligations
// (CSRF attach on admin mutations, 429 countdown surfacing, `code`-field
// branching) start as unit-level contract tests here; real integration
// tests against the test backend live in tests/integration/.
describe("api/client.ts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches X-CSRF-Token on mutating admin requests", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/admin/students", { name: "x" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("mock-csrf-token");
  });

  it("does not attach X-CSRF-Token on CSRF-exempt guest booking routes", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: "cancelled" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/bookings/manage/sometoken/cancel");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("throws RateLimitedError with retryAfterSeconds on a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({}), {
            status: 429,
            headers: { "Retry-After": "42" },
          }),
      ),
    );

    try {
      await apiGet("/api/bookings/manage/x");
      expect.unreachable("expected apiGet to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      expect((err as RateLimitedError).retryAfterSeconds).toBe(42);
    }
  });

  it("throws ApiError with the backend's machine-readable code field", async () => {
    // api/errors.py::to_http_exception's body shape:
    // {"detail": {"detail": "<message>", "code": "BookingError.SessionFull"}}
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: { detail: "this session is full", code: "BookingError.SessionFull" },
            }),
            { status: 409 },
          ),
      ),
    );

    try {
      await apiGet("/api/bookings/manage/x");
      expect.unreachable("expected apiGet to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("BookingError.SessionFull");
      expect((err as ApiError).message).toBe("this session is full");
    }
  });
});
