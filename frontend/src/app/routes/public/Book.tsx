// The 3-step guest booking flow -- docs/design/04-booking-and-scheduling.md's
// "Frontend booking flow" contract: pick a class (plain-words seat
// counts, waitlist offer on full sessions) -> your details (RHF+zod,
// attestation + sms consent + party stepper) -> confirm (large-type
// summary -> Book -> confirmation w/ manage link + big print affordance).
// Enterable with ?course=<slug> or ?session=<id> preselected. Every step
// renders the phone-call fallback; nothing here depends on hover, drag,
// or timing (the 429 countdown is a plain re-rendered number, not an
// animation the user must watch).

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { CONTENT } from "../../../content/mock";
import { BackHomeLink } from "../../../components/BackHomeLink";
import { PhoneFallbackNote } from "../../../components/PhoneFallbackNote";
import { BigButton } from "../../../components/BigButton";
import { Field } from "../../../components/Field";
import { Stepper } from "../../../components/Stepper";
import { usePageMeta } from "../../layout/PageMeta";
import { fetchCourses, fetchCourseSessions, type CourseCard, type SessionCard } from "../../../api/courses";
import { createBooking, joinWaitlist, type BookingCreateResponse } from "../../../api/bookings";
import { ApiError, RateLimitedError } from "../../../api/client";
import { zodResolver } from "../../../lib/zodResolver";
import { bookingDetailsSchema, type BookingDetailsFormValues } from "../../../lib/bookingSchema";
import { nextStep, prevStep, stepNumber, formatSeatsOpen, type BookStep } from "../../../lib/booking";
import { formatRetryAt, formatSessionTime } from "../../../lib/time";

const T = CONTENT.booking;

function StepHeading({ step }: { step: BookStep }) {
  const label =
    step === "pick" ? T.steps.pickClass : step === "details" ? T.steps.yourDetails : T.steps.confirm;
  return (
    <p className="mb-2 text-lg font-semibold uppercase tracking-wide text-mp-muted">
      Step {stepNumber(step)} of 3
      <span className="ml-2 text-mp-white">{label}</span>
    </p>
  );
}

/** A live, second-by-second re-rendered countdown for a 429 response --
 * plain text, never an animation, so nothing here depends on timing
 * perception (doc 04's "no timing dependencies" rule; this just tells
 * the truth about the clock, it does not require the user to react to it). */
function useCountdown(initialSeconds: number): number {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    setRemaining(initialSeconds);
    if (initialSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [initialSeconds]);
  return remaining;
}

export function Book() {
  usePageMeta({
    title: CONTENT.meta.book.title,
    description: CONTENT.meta.book.description,
    path: "/book",
  });

  const [searchParams] = useSearchParams();
  const preselectCourse = searchParams.get("course");
  const preselectSession = searchParams.get("session");

  const [step, setStep] = useState<BookStep>("pick");
  const [courseSlug, setCourseSlug] = useState<string | null>(preselectCourse);
  const [session, setSession] = useState<SessionCard | null>(null);
  const [isWaitlist, setIsWaitlist] = useState(false);
  const [details, setDetails] = useState<BookingDetailsFormValues | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingCreateResponse | null>(null);

  const countdown = useCountdown(retryAfter ?? 0);

  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const sessionsQuery = useQuery({
    queryKey: ["course-sessions", courseSlug],
    queryFn: () => fetchCourseSessions(courseSlug as string),
    enabled: !!courseSlug,
  });

  // ?session=<id> preselect: once courses load, hunt for the course whose
  // sessions include this id. Best-effort -- if it is not found the user
  // just lands on the normal course-picker, never a dead end.
  useEffect(() => {
    if (!preselectSession || courseSlug) return;
    let cancelled = false;
    async function findCourseForSession() {
      const courses = coursesQuery.data;
      if (!courses) return;
      for (const course of courses) {
        const sessions = await fetchCourseSessions(course.slug).catch(() => []);
        const match = sessions.find((s) => s.id === preselectSession);
        if (match && !cancelled) {
          setCourseSlug(course.slug);
          setSession(match);
          setStep("details");
          return;
        }
      }
    }
    findCourseForSession();
    return () => {
      cancelled = true;
    };
  }, [preselectSession, coursesQuery.data, courseSlug]);

  const form = useForm<BookingDetailsFormValues>({
    resolver: zodResolver(bookingDetailsSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      partySize: 1,
      attestationAccepted: undefined as unknown as true,
      smsConsent: false,
      honeypotField: "",
    },
  });

  const partySize = form.watch("partySize");

  function pickCourse(course: CourseCard) {
    setCourseSlug(course.slug);
    setSession(null);
  }

  function pickSession(s: SessionCard, waitlist: boolean) {
    setSession(s);
    setIsWaitlist(waitlist);
    setStep(nextStep("pick"));
  }

  function onSubmitDetails(values: BookingDetailsFormValues) {
    setDetails(values);
    setStep(nextStep("details"));
  }

  async function onBook() {
    if (!session || !details) return;
    setSubmitting(true);
    setSubmitError(null);
    setRetryAfter(null);
    const payload = {
      session_id: session.id,
      full_name: details.fullName,
      email: details.email,
      phone: details.phone || null,
      party_size: details.partySize,
      attestation: { version: T.attestationVersion, accepted: details.attestationAccepted },
      sms_consent: details.smsConsent,
      honeypot_field: details.honeypotField ?? "",
    };
    try {
      if (isWaitlist) {
        await joinWaitlist(payload);
        setResult(null);
      } else {
        const response = await createBooking(payload);
        setResult(response);
      }
      setStep(nextStep("confirm"));
    } catch (err) {
      if (err instanceof RateLimitedError) {
        setRetryAfter(err.retryAfterSeconds);
      } else if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Please call us to book instead.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCourse = useMemo(
    () => coursesQuery.data?.find((c) => c.slug === courseSlug) ?? null,
    [coursesQuery.data, courseSlug],
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <BackHomeLink className="mb-6" />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {CONTENT.meta.book.title}
      </h1>

      {step !== "confirmed" && <StepHeading step={step} />}

      {step === "pick" && (
        <section className="mt-6 flex flex-col gap-6">
          {coursesQuery.isLoading && <p className="text-lg text-mp-white">Loading classes...</p>}
          {coursesQuery.isError && (
            <p className="text-lg text-mp-red-text">
              We could not load classes right now. Please call us to book instead.
            </p>
          )}

          {!courseSlug && coursesQuery.data && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {coursesQuery.data.map((course) => (
                <li key={course.id} className="border-2 border-mp-border bg-mp-surface p-4">
                  <h2 className="font-display text-xl font-extrabold italic uppercase text-mp-white">
                    {course.title}
                  </h2>
                  <p className="mt-2 text-lg text-mp-white">{course.summary}</p>
                  <BigButton className="mt-4" onClick={() => pickCourse(course)}>
                    Choose this class
                  </BigButton>
                </li>
              ))}
            </ul>
          )}

          {courseSlug && (
            <div>
              <button
                type="button"
                className="mb-4 text-lg font-semibold text-mp-red-text underline"
                onClick={() => setCourseSlug(null)}
              >
                Choose a different class
              </button>
              <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
                {selectedCourse?.title ?? "Sessions"}
              </h2>
              {sessionsQuery.isLoading && <p className="mt-4 text-lg text-mp-white">Loading sessions...</p>}
              {sessionsQuery.isError && (
                <p className="mt-4 text-lg text-mp-red-text">
                  We could not load sessions right now. Please call us to book instead.
                </p>
              )}
              {sessionsQuery.data && sessionsQuery.data.length === 0 && (
                <p className="mt-4 text-lg text-mp-white">No upcoming sessions. Please call us.</p>
              )}
              <ul className="mt-4 flex flex-col gap-4">
                {sessionsQuery.data?.map((s) => {
                  const full = s.seats_open <= 0;
                  return (
                    <li key={s.id} className="border-2 border-mp-border bg-mp-surface p-4">
                      <p className="text-lg font-semibold text-mp-white">{formatSessionTime(s.starts_at)}</p>
                      <p className="text-lg text-mp-white">
                        {s.location_name} -- {s.location_addr}
                      </p>
                      <p className="mt-1 text-lg text-mp-white">
                        {full ? T.seatsFullNote : formatSeatsOpen(s.seats_open, s.capacity)}
                      </p>
                      <BigButton className="mt-3" onClick={() => pickSession(s, full)}>
                        {full ? T.waitlistCta : "Select this session"}
                      </BigButton>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <PhoneFallbackNote />
        </section>
      )}

      {step === "details" && session && (
        <form className="mt-6 flex flex-col gap-6" onSubmit={form.handleSubmit(onSubmitDetails)} noValidate>
          <Field
            id="fullName"
            label={T.fields.fullName}
            errorMessage={form.formState.errors.fullName?.message}
            {...form.register("fullName")}
          />
          <Field
            id="email"
            label={T.fields.email}
            type="email"
            errorMessage={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <Field
            id="phone"
            label={T.fields.phone}
            type="tel"
            errorMessage={form.formState.errors.phone?.message}
            {...form.register("phone")}
          />
          <Stepper
            label={T.fields.partySize}
            value={partySize}
            onChange={(next) => form.setValue("partySize", next, { shouldValidate: true })}
          />
          {form.formState.errors.partySize && (
            <p className="text-lg text-mp-red-text">{form.formState.errors.partySize.message}</p>
          )}

          <div className="border-2 border-mp-border bg-mp-surface p-4">
            <p className="text-lg text-mp-white">{T.attestationText}</p>
            <label className="mt-3 flex min-h-[48px] items-center gap-3 text-lg font-semibold text-mp-white">
              <input
                type="checkbox"
                className="h-8 w-8"
                {...form.register("attestationAccepted")}
              />
              {T.fields.attestationLabel}
            </label>
            {form.formState.errors.attestationAccepted && (
              <p role="alert" className="mt-2 text-lg text-mp-red-text">
                {form.formState.errors.attestationAccepted.message}
              </p>
            )}
          </div>

          <div className="border-2 border-mp-border bg-mp-surface p-4">
            <p className="text-lg text-mp-white">{T.smsConsentText}</p>
            <label className="mt-3 flex min-h-[48px] items-center gap-3 text-lg font-semibold text-mp-white">
              <input type="checkbox" className="h-8 w-8" {...form.register("smsConsent")} />
              {T.fields.smsConsentLabel}
            </label>
          </div>

          {/* Honeypot: real humans never see this field (docs/design/02).
              aria-hidden + tabindex=-1 + autoComplete off so it is invisible
              and unreachable to assistive tech and keyboard users, but a
              bot's naive form-filler still finds and fills it. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="honeypotField">Leave this field blank</label>
            <input
              id="honeypotField"
              tabIndex={-1}
              autoComplete="off"
              {...form.register("honeypotField")}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <BigButton variant="secondary" type="button" onClick={() => setStep(prevStep("details"))}>
              Back
            </BigButton>
            <BigButton type="submit">Continue</BigButton>
          </div>
          <PhoneFallbackNote />
        </form>
      )}

      {step === "confirm" && session && details && (
        <section className="mt-6 flex flex-col gap-6">
          <h2 className="font-display text-2xl font-extrabold italic uppercase text-mp-white">
            {T.confirmHeading}
          </h2>
          <dl className="grid gap-3 text-xl text-mp-white">
            <div>
              <dt className="font-semibold">Class</dt>
              <dd>{selectedCourse?.title}</dd>
            </div>
            <div>
              <dt className="font-semibold">When</dt>
              <dd>{formatSessionTime(session.starts_at)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Where</dt>
              <dd>
                {session.location_name} -- {session.location_addr}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Name</dt>
              <dd>{details.fullName}</dd>
            </div>
            <div>
              <dt className="font-semibold">Party size</dt>
              <dd>{details.partySize}</dd>
            </div>
            {isWaitlist && (
              <div>
                <dt className="font-semibold">Note</dt>
                <dd>{T.seatsFullNote} You are joining the waitlist, not booking a confirmed seat.</dd>
              </div>
            )}
          </dl>

          {submitError && (
            <p role="alert" className="text-lg text-mp-red-text">
              {submitError}
            </p>
          )}

          {retryAfter !== null && (
            <div className="border-2 border-mp-red-text bg-mp-surface p-4">
              <p className="font-display text-xl font-extrabold italic uppercase text-mp-red-text">
                {T.rateLimitedHeading}
              </p>
              <p className="mt-2 text-lg text-mp-white">{formatRetryAt(countdown)}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <BigButton variant="secondary" type="button" onClick={() => setStep(prevStep("confirm"))}>
              Back
            </BigButton>
            <BigButton
              type="button"
              onClick={onBook}
              disabled={submitting || (retryAfter !== null && countdown > 0)}
            >
              {isWaitlist ? T.waitlistCta : T.bookCta}
            </BigButton>
          </div>
          <PhoneFallbackNote />
        </section>
      )}

      {step === "confirmed" && (
        <section className="mt-6 flex flex-col gap-6">
          <h2 className="font-display text-3xl font-extrabold italic uppercase text-mp-white">
            {isWaitlist ? T.waitlistJoinedNote : T.confirmedHeading}
          </h2>

          {!isWaitlist && (
            <>
              <p className="text-xl text-mp-white">{T.confirmedEmailedNote}</p>
              {result && (
                <p className="text-lg text-mp-white">
                  Manage your booking any time at{" "}
                  <a href={result.manage_url} className="font-semibold text-mp-red-text underline">
                    {result.manage_url}
                  </a>
                  .
                </p>
              )}
              <BigButton type="button" onClick={() => window.print()}>
                {T.printCta}
              </BigButton>
            </>
          )}
          <PhoneFallbackNote />
        </section>
      )}
    </main>
  );
}
