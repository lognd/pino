// Invoice + payment-link reads for the guest /pay/:token flow and the
// admin Invoices mockup screen. See docs/design/05-payments-and-invoicing.md
// and docs/design/14-admin-mockup.md. CRIB:
// logand.app/frontend/src/api/invoices.ts for the Invoice interface shape
// and snake_case-matches-backend-JSON discipline (see that file's own
// comment on why camelCase drift there was a real bug).
//
// TODO(impl): docs/design/05-payments-and-invoicing.md

import { apiGet, apiPost } from "./client";

export interface Invoice {
  id: string;
  status: "unpaid" | "partial" | "paid";
  amount_due: string;
  amount_paid: string;
}

export function fetchInvoiceByToken(_token: string): Promise<Invoice> {
  return apiGet<Invoice>(`/api/invoices/pay/${_token}`);
}

// --- Admin surface (docs/design/14-admin-mockup.md's Invoices + Record
// payment screens) -- richer shapes than the guest Invoice above, mirroring
// the MSW handlers' response (src/mocks/handlers.ts).

export interface AdminInvoiceLineItem {
  id: string;
  description: string;
  amount: string;
}

export interface AdminPayment {
  id: string;
  method: "cash" | "card_reader" | "zelle" | "other";
  amount: string;
  recorded_at: string;
  note: string;
}

export interface AdminInvoice {
  id: string;
  student_id: string;
  session_id: string | null;
  status: "unpaid" | "partial" | "paid";
  amount_due: string;
  amount_paid: string;
  line_items: AdminInvoiceLineItem[];
  payments: AdminPayment[];
  student: { id: string; full_name: string; email: string; phone: string } | null;
}

export function fetchAdminInvoices(): Promise<AdminInvoice[]> {
  return apiGet<AdminInvoice[]>("/api/admin/invoices");
}

export function fetchAdminInvoice(invoiceId: string): Promise<AdminInvoice> {
  return apiGet<AdminInvoice>(`/api/admin/invoices/${invoiceId}`);
}

export function recordPayment(
  invoiceId: string,
  method: "cash" | "card_reader" | "zelle" | "other",
  amount: string,
  note?: string,
): Promise<AdminInvoice> {
  return apiPost<AdminInvoice>(`/api/admin/invoices/${invoiceId}/payments`, { method, amount, note });
}
