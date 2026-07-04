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

export function recordPayment(
  _invoiceId: string,
  _method: "cash" | "card_reader" | "zelle" | "other",
  _amount: string,
): Promise<Invoice> {
  return apiPost<Invoice>(`/api/admin/invoices/${_invoiceId}/payments`);
}
