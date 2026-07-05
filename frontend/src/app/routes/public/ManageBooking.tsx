// Guest manage/cancel-booking journey via signed token -- resolves the
// token server-side; renders a friendly 404 in plain language if expired
// or invalid (a wrong, guessed, or expired token all return the SAME 404
// per docs/design/02-auth-and-security.md -- never distinguished here
// either). Supports cancel (with the "too close to start time" window
// error in plain words) and resend-confirmation. Invoice link is a P4
// stub (docs/design/05) -- rendered only if the backend ever sends an
// invoice_pay_url (it does not yet, see api/bookings.ts's TODO(types)
// note); a REAL link to the pay page once it does, not a hand-built
// path -- see that note for why a raw invoice id would never work here.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CONTENT } from "../../../content/mock";
import { BackHomeLink } from "../../../components/BackHomeLink";
import { PhoneFallbackNote } from "../../../components/PhoneFallbackNote";
import { BigButton } from "../../../components/BigButton";
import { StatusBadge, type Status } from "../../../components/StatusBadge";
import { usePageMeta } from "../../layout/PageMeta";
import { cancelBookingByToken, fetchBookingByToken, resendConfirmation } from "../../../api/bookings";
import { ApiError } from "../../../api/client";
import { formatSessionTime } from "../../../lib/time";

const T = CONTENT.booking.manage;

function toStatus(status: string): Status | null {
  return status === "confirmed" || status === "pending" || status === "waitlisted"
    ? (status as Status)
    : null;
}

export function ManageBooking() {
  const { token } = useParams<{ token: string }>();
  usePageMeta({
    title: T.heading,
    description: CONTENT.meta.book.description,
    path: `/booking/${token ?? ""}`,
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resending, setResending] = useState(false);

  const bookingQuery = useQuery({
    queryKey: ["booking-manage", token],
    queryFn: () => fetchBookingByToken(token as string),
    enabled: !!token,
    retry: false,
  });

  async function onCancel() {
    if (!token) return;
    setCancelling(true);
    setActionError(null);
    try {
      await cancelBookingByToken(token);
      setActionNote(T.cancelledNote);
      await bookingQuery.refetch();
    } catch (err) {
      if (err instanceof ApiError && err.code === "BookingError.CancellationWindowClosed") {
        setActionError(T.cancelWindowClosedNote);
      } else if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError("Something went wrong. Please call us.");
      }
    } finally {
      setCancelling(false);
    }
  }

  async function onResend() {
    if (!token) return;
    setResending(true);
    setActionError(null);
    try {
      await resendConfirmation(token);
      setActionNote(T.resendSentNote);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please call us.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <BackHomeLink className="mb-6" />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">{T.heading}</h1>

      {!token && (
        <p className="mt-6 text-lg text-mp-red-text">This link is missing its booking code.</p>
      )}

      {token && bookingQuery.isLoading && <p className="mt-6 text-lg text-mp-white">Loading your booking...</p>}

      {token && bookingQuery.isError && (
        <section className="mt-6 flex flex-col gap-4">
          <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
            {T.notFoundHeading}
          </h2>
          <p className="text-lg text-mp-white">{T.notFoundNote}</p>
          <PhoneFallbackNote />
        </section>
      )}

      {bookingQuery.data && (
        <section className="mt-6 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            {toStatus(bookingQuery.data.status) && <StatusBadge status={toStatus(bookingQuery.data.status) as Status} />}
            <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
              {bookingQuery.data.course_title}
            </h2>
          </div>
          <dl className="grid gap-3 text-xl text-mp-white">
            <div>
              <dt className="font-semibold">When</dt>
              <dd>{formatSessionTime(bookingQuery.data.starts_at)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Where</dt>
              <dd>
                {bookingQuery.data.location_name} -- {bookingQuery.data.location_addr}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Party size</dt>
              <dd>{bookingQuery.data.party_size}</dd>
            </div>
          </dl>

          {actionNote && <p className="text-lg text-mp-white">{actionNote}</p>}
          {actionError && (
            <p role="alert" className="text-lg text-mp-red-text">
              {actionError}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {bookingQuery.data.status === "confirmed" && bookingQuery.data.can_cancel_online && (
              <BigButton type="button" onClick={onCancel} disabled={cancelling}>
                {T.cancelCta}
              </BigButton>
            )}
            {bookingQuery.data.status === "confirmed" && (
              <BigButton variant="secondary" type="button" onClick={onResend} disabled={resending}>
                {T.resendCta}
              </BigButton>
            )}
          </div>

          {bookingQuery.data.status === "confirmed" && !bookingQuery.data.can_cancel_online && (
            <p className="text-lg text-mp-white">{T.cancelWindowClosedNote}</p>
          )}

          {/* Add-to-calendar: a one-click Google link plus a plain .ics
              download for Apple/Outlook (backend api/bookings.py). Plain
              labeled links, elderly-first (doc 09). */}
          {bookingQuery.data.status === "confirmed" && bookingQuery.data.google_calendar_url && (
            <div className="flex flex-col gap-2">
              <a
                href={bookingQuery.data.google_calendar_url}
                target="_blank"
                rel="noreferrer"
                className="text-lg font-semibold text-mp-white underline underline-offset-4"
              >
                Add this class to Google Calendar
              </a>
              {bookingQuery.data.ics_url && (
                <a
                  href={bookingQuery.data.ics_url}
                  className="text-lg font-semibold text-mp-white underline underline-offset-4"
                  download
                >
                  Download for Apple or Outlook calendars (.ics)
                </a>
              )}
            </div>
          )}

          {bookingQuery.data.invoice_pay_url && (
            <a
              href={bookingQuery.data.invoice_pay_url}
              className="text-lg font-semibold text-mp-red-text underline"
            >
              {T.invoiceLinkLabel}
            </a>
          )}

          <PhoneFallbackNote />
        </section>
      )}
    </main>
  );
}
