// The only module allowed to call fetch() directly -- see
// docs/design/07-frontend-architecture.md's "API client rules". CRIB:
// logand.app/frontend/src/api/client.ts nearly verbatim (single fetch
// chokepoint, CSRF header on mutations, 401/429 handling, ApiError with
// a stable machine-readable `code`). Two melpino-specific differences to
// implement here that logand's version does not have:
//   - Guest booking/manage/pay tokens travel in the URL path only, never
//     persisted to localStorage/sessionStorage (docs/design/02).
//   - Guest routes (booking flow) are CSRF-exempt by design (docs/design/02)
//     -- only the admin surface attaches X-CSRF-Token.

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limited, retry after ${retryAfterSeconds}s`);
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("unauthenticated");
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
  ) {
    super(message);
  }
}

// Guest routes carry their own signed token in the URL and are CSRF-exempt
// by design (docs/design/02); everything else (the admin surface) attaches
// the CSRF header on mutating verbs.
function isCsrfExemptPath(path: string): boolean {
  return (
    path.startsWith("/api/bookings/manage/") ||
    path.startsWith("/api/invoices/pay/")
  );
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method, headers, credentials: "include" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  if (method !== "GET" && !isCsrfExemptPath(path)) {
    headers["X-CSRF-Token"] = "mock-csrf-token";
  }

  const response = await fetch(path, init);

  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0");
    throw new RateLimitedError(retryAfterSeconds);
  }
  if (!response.ok) {
    let code: string | undefined;
    let message = `Request failed: ${response.status}`;
    try {
      // api/errors.py::to_http_exception's body is
      // {"detail": {"detail": "<human message>", "code": "BookingError.X"}}
      // -- FastAPI's HTTPException(detail=...) adds the OUTER "detail" key,
      // and to_http_exception's own payload is the inner object. Unwrap
      // both layers so callers can branch on the stable `code`.
      const payload = (await response.json()) as {
        detail?: { detail?: string; code?: string } | string;
        code?: string;
        message?: string;
      };
      if (payload.detail && typeof payload.detail === "object") {
        code = payload.detail.code;
        message = payload.detail.detail ?? message;
      } else {
        code = payload.code;
        message = (typeof payload.detail === "string" ? payload.detail : payload.message) ?? message;
      }
    } catch {
      // no JSON body -- fall back to the status-based message above.
    }
    throw new ApiError(message, code);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}
