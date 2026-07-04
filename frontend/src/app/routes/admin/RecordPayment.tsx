// Record payment (/admin/invoices/:invoiceId/pay) --
// docs/design/14-admin-mockup.md: pick a method (cash / card reader /
// Zelle / other), enter amount, confirm, and see the invoice flip toward
// paid. A confirm step precedes the payment "posting" (mock-only).

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminInvoice, recordPayment, type AdminPayment } from "../../../api/invoices";
import { SampleBanner } from "../../../components/SampleBanner";
import { BigButton } from "../../../components/BigButton";
import { Field } from "../../../components/Field";

const METHODS: AdminPayment["method"][] = ["cash", "card_reader", "zelle", "other"];

export function AdminRecordPayment() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ["admin", "invoice", invoiceId],
    queryFn: () => fetchAdminInvoice(invoiceId as string),
    enabled: !!invoiceId,
  });

  const [method, setMethod] = useState<AdminPayment["method"]>("cash");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () => recordPayment(invoiceId as string, method, amount),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "invoice", invoiceId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });

  function handleContinue(event: FormEvent) {
    event.preventDefault();
    setConfirming(true);
  }

  function handleConfirm() {
    mutation.mutate();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Record payment
      </h1>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load this invoice.</p>}

      {invoice && !confirming && !mutation.isSuccess && (
        <form onSubmit={handleContinue} className="mt-6 flex flex-col gap-6">
          <p className="text-lg text-mp-white">
            {invoice.student?.full_name ?? "SAMPLE student"} owes ${invoice.amount_due}, has paid $
            {invoice.amount_paid}.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="method" className="text-lg font-semibold text-mp-white">
              Payment method
            </label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as AdminPayment["method"])}
              className="min-h-[48px] border-2 border-mp-border bg-mp-surface px-3 text-lg text-mp-white"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="amount"
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <BigButton type="submit">Continue</BigButton>
        </form>
      )}

      {invoice && confirming && !mutation.isSuccess && (
        <div className="mt-6 flex flex-col gap-6">
          <p className="text-lg text-mp-white">
            Confirm: record ${amount || "0.00"} via {method} for {invoice.student?.full_name ?? "SAMPLE student"}?
          </p>
          <div className="flex flex-wrap gap-4">
            <BigButton type="button" onClick={handleConfirm} disabled={mutation.isPending}>
              {mutation.isPending ? "Posting..." : "Confirm payment"}
            </BigButton>
            <BigButton type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Back
            </BigButton>
          </div>
          {mutation.isError && (
            <p className="text-lg text-mp-red-text">Could not record the payment. Try again.</p>
          )}
        </div>
      )}

      {mutation.isSuccess && (
        <div className="mt-6 flex flex-col gap-6">
          <p className="text-lg text-mp-white">
            Payment recorded. Invoice is now {mutation.data.status}.
          </p>
          <div className="flex flex-wrap gap-4">
            <BigButton type="button" onClick={() => navigate("/admin/invoices")}>
              Back to invoices
            </BigButton>
            <Link to="/admin/invoices" className="text-lg font-semibold text-mp-white underline">
              Invoices list
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
