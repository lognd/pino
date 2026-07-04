// The 3-step guest booking flow -- docs/design/04-booking-and-scheduling.md.
// This is P3 scope; this route stays a stub for P1, clearly marked "coming
// soon" with the phone-call fallback (doc 04's binding elderly-first
// constraint: no dead end without a phone number). Stepper.tsx has been
// repurposed (P1) as the reusable party-size +/- control this flow will
// use later; it is not wired into a form here yet.
//
// TODO(impl): docs/design/04-booking-and-scheduling.md

import { CONTENT } from "../../../content/mock";
import { PhoneFallbackNote } from "../../../components/PhoneFallbackNote";
import { usePageMeta } from "../../layout/PageMeta";

export function Book() {
  usePageMeta({
    title: CONTENT.meta.book.title,
    description: CONTENT.meta.book.description,
    path: "/book",
  });

  return (
    <main className="px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        {CONTENT.book.comingSoonHeading}
      </h1>
      <p className="mt-4 max-w-[70ch] text-lg text-mp-white">{CONTENT.book.comingSoonNote}</p>
      {/* TODO(impl): docs/design/04-booking-and-scheduling.md -- the real
          3-step flow (pick a class / your details / confirm) */}
      <div className="mt-6">
        <PhoneFallbackNote />
      </div>
    </main>
  );
}
