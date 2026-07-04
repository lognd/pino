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
//
// TODO(impl): docs/design/07-frontend-architecture.md

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

export function apiGet<T>(_path: string): Promise<T> {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function apiPost<T>(_path: string, _body?: unknown): Promise<T> {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function apiPatch<T>(_path: string, _body?: unknown): Promise<T> {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}

export function apiDelete<T>(_path: string): Promise<T> {
  throw new Error("TODO(impl): docs/design/07-frontend-architecture.md");
}
