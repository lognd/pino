// Guest pay-by-link surface -- docs/design/05-payments-and-invoicing.md.
// Talks to api/invoices_public.py's `/api/pay/{token}` router (backend
// prefix confirmed by reading that file + app.py's _CSRF_EXEMPT_PREFIXES
// directly, NOT api/invoices.ts's admin `/api/admin/invoices` surface --
// this is a completely separate, invoice-scoped-token auth model with no
// customer session, see docs/design/02-auth-and-security.md).
//
// TODO(types): every shape below is hand-typed, not sourced from
// api.generated.ts. api.generated.ts's "/api/invoices/pay/{pay_token}"
// paths are STALE -- they predate the real router landing at
// api/invoices_public.py (`APIRouter(prefix="/api/pay", ...)`), so the
// generated file and the real backend now disagree on the path shape.
// Regenerating was out of scope for this pass (another agent's backend
// tree was being edited concurrently -- see this build's final report).
// Mirrors api/invoices_public.py's pydantic response models
// (PaymentMethodsResponse, InvoiceStatusResponse) and the ad-hoc dict
// bodies of the stripe-intent/paypal-order/capture routes field-for-field;
// keep in sync by hand until that route regeneration happens.

import { apiGet, apiPost } from "./client";
import { ApiError } from "./client";

/** Which of stripe/paypal/zelle are currently configured -- a guest only
 * ever sees buttons for methods that would actually work (never a
 * PayPal button that immediately 503s). */
export interface PaymentMethodsAvailability {
  stripe: boolean;
  paypal: boolean;
  zelle_handle: string | null;
}

/** GET /api/pay/{token} -- pay page data: amount due + invoice status +
 * available methods. A wrong/expired/guessed token all return the SAME
 * 404 (never confirms an invoice exists), per docs/design/02. */
export interface InvoiceSummary {
  invoice_id: string;
  status: string;
  amount_total: string;
  amount_due: string;
  currency: string;
  payment_methods: PaymentMethodsAvailability;
}

/** Invoice statuses the pay endpoints will actually accept -- mirrors
 * api/invoices_public.py's own `invoice.status not in ("sent", "overdue")`
 * checks on the stripe-intent/paypal-order routes. Used only to decide
 * what this page SHOWS; the backend's own check is still the real
 * enforcement. */
export const PAYABLE_STATUSES = new Set(["sent", "overdue"]);

export function fetchInvoiceSummary(token: string): Promise<InvoiceSummary> {
  return apiGet<InvoiceSummary>(`/api/pay/${encodeURIComponent(token)}`);
}

/** POST /api/pay/{token}/payment-methods -- same body as the GET above's
 * `payment_methods` field, but scoped to a real invoice token (still
 * 404s an invalid token). Exists for callers that only need a fresh
 * methods check without re-fetching the whole invoice summary. */
export function checkPaymentMethods(token: string): Promise<PaymentMethodsAvailability> {
  return apiPost<PaymentMethodsAvailability>(`/api/pay/${encodeURIComponent(token)}/payment-methods`);
}

/** client_secret (not clientSecret) -- api/invoices_public.py's
 * create_stripe_intent route returns `{"client_secret": ...}` literally. */
export function createStripeIntent(token: string): Promise<{ client_secret: string }> {
  return apiPost<{ client_secret: string }>(`/api/pay/${encodeURIComponent(token)}/stripe-intent`);
}

export interface PaypalOrderResponse {
  order_id: string;
  approval_url: string | null;
}

/** POST /api/pay/{token}/paypal-order -- a real redirect target (this
 * app never renders PayPal's own approval UI itself). */
export function createPaypalOrder(token: string): Promise<PaypalOrderResponse> {
  return apiPost<PaypalOrderResponse>(`/api/pay/${encodeURIComponent(token)}/paypal-order`);
}

/** POST /api/pay/{token}/paypal-order/{order_id}/capture -- called once
 * PayPal redirects the guest back with `?token=<order_id>` appended to
 * this same pay page (see api/invoices_public.py's
 * capture_paypal_order_endpoint's own doc comment on why the client-
 * supplied order_id is re-validated server-side against reference_id). */
export function capturePaypalOrder(token: string, orderId: string): Promise<{ status: string }> {
  return apiPost<{ status: string }>(
    `/api/pay/${encodeURIComponent(token)}/paypal-order/${encodeURIComponent(orderId)}/capture`,
  );
}

/** Zelle content-type allowlist mirrored from api/invoices_public.py's
 * NOTE (see this file's header comment): the guest-facing upload route
 * this posts to does not exist on the backend yet
 * (PaymentProof.uploaded_by is a NOT NULL fk to users.id -- "there is no
 * guest-facing upload endpoint yet"). This constant + uploadPaymentProof
 * below are wired now so the UI is ready the moment that endpoint lands;
 * until then every call 404s and Pay.tsx shows the friendly "not
 * available yet, please call us" fallback rather than a generic error. */
export const PAYMENT_PROOF_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];

/** True once the guest-facing payment-proof upload endpoint exists on
 * the backend -- see this module's header/PAYMENT_PROOF_CONTENT_TYPES
 * comment. A 404 here is expected today, not a bug; Pay.tsx branches on
 * it via isProofUploadUnavailable below instead of showing a generic
 * error banner. */
export function isProofUploadUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.code !== undefined) return false;
  // No custom `code` means this 404 came from FastAPI's default
  // "route not found" handling (a plain {"detail": "Not Found"} body,
  // or no JSON body at all in dev) rather than a mapped ErrorSet variant
  // -- exactly what an unimplemented route looks like from the client.
  return err.message === "Not Found" || err.message.startsWith("Request failed: 404");
}

/** POST /api/pay/{token}/payment-proof -- real multipart/form-data
 * upload, same pattern as logand.app's uploadPaymentProof. See this
 * module's header comment: the backend route this targets does not
 * exist yet, so this call is expected to 404 until it does. */
export function uploadPaymentProof(token: string, file: File): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiPost<{ id: string }>(`/api/pay/${encodeURIComponent(token)}/payment-proof`, formData);
}
