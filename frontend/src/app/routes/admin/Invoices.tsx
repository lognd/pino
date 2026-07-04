// Invoices (/admin/invoices) -- docs/design/14-admin-mockup.md: list of
// invoices with amount, paid/unpaid/partial state, and deposit status;
// filter by state. Drill-down (inline expand) shows line items and
// payment history; launches the record-payment flow.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminInvoices, type AdminInvoice } from "../../../api/invoices";
import { SampleBanner } from "../../../components/SampleBanner";
import { StatusBadge } from "../../../components/StatusBadge";

type Filter = "all" | AdminInvoice["status"];

export function AdminInvoices() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "invoices"],
    queryFn: fetchAdminInvoices,
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = (data ?? []).filter((inv) => filter === "all" || inv.status === filter);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Invoices
      </h1>

      <div className="mt-6 flex flex-wrap gap-4">
        {(["all", "unpaid", "partial", "paid"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "min-h-[48px] border-2 px-4 text-lg font-semibold uppercase " +
              (filter === f ? "border-mp-red bg-mp-red text-mp-white" : "border-mp-border text-mp-white")
            }
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load invoices.</p>}

      <ul className="mt-8 flex flex-col gap-4">
        {filtered.map((invoice) => {
          const isOpen = openId === invoice.id;
          return (
            <li key={invoice.id} className="border-2 border-mp-border bg-mp-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : invoice.id)}
                    aria-expanded={isOpen}
                    className="min-h-[48px] text-left text-xl font-semibold text-mp-white underline-offset-4 hover:underline"
                  >
                    {invoice.student?.full_name ?? "SAMPLE student"}
                  </button>
                  <p className="mt-1 text-lg text-mp-white">
                    ${invoice.amount_paid} of ${invoice.amount_due}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={invoice.status} />
                  {invoice.status !== "paid" && (
                    <Link
                      to={`/admin/invoices/${invoice.id}/pay`}
                      className="inline-flex min-h-[56px] items-center border-2 border-mp-white bg-transparent px-6 text-xl font-bold uppercase tracking-tight text-mp-white hover:bg-mp-surface"
                    >
                      Record payment
                    </Link>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 flex flex-col gap-4 border-t-2 border-mp-border pt-4">
                  <div>
                    <h3 className="text-lg font-semibold uppercase text-mp-white">Line items</h3>
                    <ul className="mt-1 flex flex-col gap-1">
                      {invoice.line_items.map((li) => (
                        <li key={li.id} className="text-lg text-mp-muted">
                          {li.description} -- ${li.amount}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold uppercase text-mp-white">Payment history</h3>
                    {invoice.payments.length === 0 && <p className="text-lg text-mp-muted">No payments recorded.</p>}
                    <ul className="mt-1 flex flex-col gap-1">
                      {invoice.payments.map((p) => (
                        <li key={p.id} className="text-lg text-mp-muted">
                          {p.method} -- ${p.amount} -- {p.recorded_at.slice(0, 10)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
