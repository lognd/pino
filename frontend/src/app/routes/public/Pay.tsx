// Guest invoice-pay flow via signed token -- docs/design/05-payments-and
// -invoicing.md's pay-by-link delta on top of logand.app's Pay page
// (CRIB: logand.app/frontend/src/app/routes/customer/Pay.tsx). A wrong,
// guessed, or expired token all render the SAME friendly "not found"
// state (never distinguished), per docs/design/02-auth-and-security.md --
// same discipline as ManageBooking.tsx's manage-token 404.
//
// Stripe: this deliberately does NOT add @stripe/stripe-js (no new
// runtime deps, per this build's constraint). logand's own Pay page also
// avoids the SDK today (its own TODO(logan) admits Elements/Checkout
// isn't mounted yet) but just prints the raw client_secret, which is not
// something an elderly first-time user should ever see. Instead: the
// real POST /api/pay/{token}/stripe-intent call still happens (proves
// the data flow end to end -- row lock, idempotent-reuse, real
// client_secret), but the result renders as an explicit, clearly-marked
// TODO(P7) panel telling the guest card payment isn't live yet and to
// use another method or call in, rather than a raw technical string.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { CONTENT } from "../../../content/mock";
import { BackHomeLink } from "../../../components/BackHomeLink";
import { PhoneFallbackNote } from "../../../components/PhoneFallbackNote";
import { BigButton } from "../../../components/BigButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { usePageMeta } from "../../layout/PageMeta";
import {
  capturePaypalOrder,
  createPaypalOrder,
  createStripeIntent,
  fetchInvoiceSummary,
  isProofUploadUnavailable,
  PAYABLE_STATUSES,
  PAYMENT_PROOF_CONTENT_TYPES,
  uploadPaymentProof,
} from "../../../api/pay";
import { ApiError, RateLimitedError } from "../../../api/client";
import { formatRetryAt } from "../../../lib/time";

const T = CONTENT.pay;

function friendlyMutationError(err: unknown): string {
  if (err instanceof RateLimitedError) {
    return `${T.rateLimitedNote} ${formatRetryAt(err.retryAfterSeconds)}`;
  }
  if (err instanceof ApiError && err.message) {
    return err.message;
  }
  return T.genericErrorNote;
}

export function Pay() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  usePageMeta({
    title: T.heading,
    description: CONTENT.meta.book.description,
    path: `/pay/${token ?? ""}`,
  });

  const invoiceQuery = useQuery({
    queryKey: ["pay-invoice", token],
    queryFn: () => fetchInvoiceSummary(token as string),
    enabled: !!token,
    retry: false,
  });
  const isPayable = invoiceQuery.data ? PAYABLE_STATUSES.has(invoiceQuery.data.status) : false;

  const stripeMutation = useMutation({
    mutationFn: () => createStripeIntent(token as string),
  });

  const paypalMutation = useMutation({
    mutationFn: () => createPaypalOrder(token as string),
    onSuccess: (order) => {
      // A real redirect to PayPal's own approval page -- the guest needs
      // to actually authenticate/approve on PayPal's own site, not here.
      if (order.approval_url) window.location.assign(order.approval_url);
    },
  });

  // PayPal redirects back to this SAME page with "?token=<order_id>"
  // appended (see api/invoices_public.py's create_order return_url,
  // built from service.pay_url_for) -- snapshotted once via lazy
  // useState, not read live from searchParams every render, so stripping
  // it from the URL below can't race the in-flight capture call reading
  // a now-null value out from under it (CRIB: logand's own Pay.tsx has
  // the full race writeup on this exact pattern).
  const [paypalOrderId] = useState(() => searchParams.get("token"));
  const captureMutation = useMutation({
    mutationFn: () => {
      if (!token || !paypalOrderId) throw new Error("missing invoice token or PayPal order id");
      return capturePaypalOrder(token, paypalOrderId);
    },
  });
  const hasStartedCaptureRef = useRef(false);
  useEffect(() => {
    if (paypalOrderId && !hasStartedCaptureRef.current) {
      hasStartedCaptureRef.current = true;
      captureMutation.mutate();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("token");
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paypalOrderId]);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofTypeError, setProofTypeError] = useState<string | null>(null);
  const proofMutation = useMutation({
    mutationFn: () => {
      if (!token || !proofFile) throw new Error("no file selected");
      return uploadPaymentProof(token, proofFile);
    },
    onSuccess: () => setProofFile(null),
  });

  function onProofFileChange(file: File | null) {
    setProofTypeError(null);
    if (file && !PAYMENT_PROOF_CONTENT_TYPES.includes(file.type)) {
      setProofFile(null);
      setProofTypeError(T.proofBadTypeNote);
      return;
    }
    setProofFile(file);
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <BackHomeLink className="mb-6" />
        <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">{T.heading}</h1>
        <p className="mt-6 text-lg text-mp-red-text">This link is missing its invoice code.</p>
      </main>
    );
  }

  if (paypalOrderId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <BackHomeLink className="mb-6" />
        <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
          {T.paypalFinishingHeading}
        </h1>
        {captureMutation.isPending && <p className="mt-6 text-lg text-mp-white">{T.paypalFinishingNote}</p>}
        {captureMutation.isSuccess && captureMutation.data?.status === "pending" && (
          <p className="mt-6 text-lg text-mp-white">{T.paypalPendingNote}</p>
        )}
        {captureMutation.isSuccess && captureMutation.data?.status !== "pending" && (
          <p className="mt-6 text-lg text-mp-success">{T.paypalSucceededNote}</p>
        )}
        {captureMutation.isError && (
          <p role="alert" className="mt-6 text-lg text-mp-red-text">
            {T.paypalFailedNote}
          </p>
        )}
        <div className="mt-6">
          <PhoneFallbackNote />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <BackHomeLink className="mb-6" />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">{T.heading}</h1>

      {invoiceQuery.isLoading && <p className="mt-6 text-lg text-mp-white">Loading your invoice...</p>}

      {invoiceQuery.isError && (
        <section className="mt-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
            {T.notFoundHeading}
          </h2>
          <p className="text-lg text-mp-white">{T.notFoundNote}</p>
          <PhoneFallbackNote />
        </section>
      )}

      {invoiceQuery.data && (
        <section className="mt-6 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            {invoiceQuery.data.status === "paid" && <StatusBadge status="paid" />}
            <dl className="text-xl text-mp-white">
              <dt className="font-semibold">{T.amountDueLabel}</dt>
              <dd className="font-display text-3xl font-extrabold italic">
                {invoiceQuery.data.currency.toUpperCase()} {invoiceQuery.data.amount_due}
              </dd>
            </dl>
          </div>

          {invoiceQuery.data.status === "paid" && (
            <div>
              <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
                {T.paidHeading}
              </h2>
              <p className="mt-2 text-lg text-mp-white">{T.paidNote}</p>
            </div>
          )}

          {!isPayable && invoiceQuery.data.status !== "paid" && (
            <p className="text-lg text-mp-white">{T.notPayableNote}</p>
          )}

          {isPayable && (
            <section className="flex flex-col gap-6">
              <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
                {T.methodsHeading}
              </h2>

              <div className="flex flex-col gap-3">
                <BigButton type="button" onClick={() => stripeMutation.mutate()} disabled={stripeMutation.isPending}>
                  {stripeMutation.isPending ? T.cardPendingNote : T.cardCta}
                </BigButton>
                {stripeMutation.isError && (
                  <p role="alert" className="text-lg text-mp-red-text">
                    {friendlyMutationError(stripeMutation.error)}
                  </p>
                )}
                {stripeMutation.data && (
                  <div className="border-2 border-mp-border bg-mp-surface p-4">
                    <h3 className="font-display text-xl font-extrabold italic uppercase text-mp-white">
                      {T.cardStartedHeading}
                    </h3>
                    <p className="mt-2 text-lg text-mp-white">{T.cardStartedNote}</p>
                  </div>
                )}
              </div>

              {invoiceQuery.data.payment_methods.paypal && (
                <div className="flex flex-col gap-3">
                  <BigButton
                    variant="secondary"
                    type="button"
                    onClick={() => paypalMutation.mutate()}
                    disabled={paypalMutation.isPending}
                  >
                    {paypalMutation.isPending ? T.paypalRedirectingNote : T.paypalCta}
                  </BigButton>
                  {paypalMutation.isError && (
                    <p role="alert" className="text-lg text-mp-red-text">
                      {friendlyMutationError(paypalMutation.error)}
                    </p>
                  )}
                </div>
              )}

              {invoiceQuery.data.payment_methods.zelle_handle && (
                <div className="border-2 border-mp-border bg-mp-surface p-4">
                  <h3 className="font-display text-xl font-extrabold italic uppercase text-mp-white">
                    {T.zelleHeading}
                  </h3>
                  <p className="mt-2 text-lg text-mp-white">
                    {T.zelleHandleLabel}: <span className="font-semibold">{invoiceQuery.data.payment_methods.zelle_handle}</span>
                  </p>
                  <p className="mt-2 text-lg text-mp-white">
                    {T.zelleReferenceLabel}: <span className="font-semibold">{invoiceQuery.data.invoice_id}</span>
                  </p>

                  <div className="mt-4 flex flex-col gap-2">
                    <label htmlFor="payment-proof" className="text-lg font-semibold text-mp-white">
                      {T.proofUploadLabel}
                    </label>
                    <input
                      id="payment-proof"
                      type="file"
                      accept={PAYMENT_PROOF_CONTENT_TYPES.join(",")}
                      onChange={(e) => onProofFileChange(e.target.files?.[0] ?? null)}
                      className="text-lg text-mp-white"
                    />
                    {proofTypeError && (
                      <p role="alert" className="text-lg text-mp-red-text">
                        {proofTypeError}
                      </p>
                    )}
                    <BigButton
                      type="button"
                      variant="secondary"
                      disabled={!proofFile || proofMutation.isPending}
                      onClick={() => proofMutation.mutate()}
                    >
                      {proofMutation.isPending ? "Uploading..." : T.proofUploadCta}
                    </BigButton>
                    {proofMutation.isSuccess && (
                      <p className="text-lg text-mp-white">{T.proofUploadedNote}</p>
                    )}
                    {proofMutation.isError && (
                      <p role="alert" className="text-lg text-mp-red-text">
                        {isProofUploadUnavailable(proofMutation.error)
                          ? T.proofUnavailableNote
                          : friendlyMutationError(proofMutation.error)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="border-2 border-mp-border bg-mp-surface p-4">
            <h2 className="font-display text-xl font-extrabold italic uppercase text-mp-white">
              {T.inPersonHeading}
            </h2>
            <p className="mt-2 text-lg text-mp-white">{T.inPersonNote}</p>
          </div>

          <PhoneFallbackNote />
        </section>
      )}
    </main>
  );
}
