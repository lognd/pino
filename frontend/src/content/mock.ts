// ---------------------------------------------------------------------------
// MOCK CONTENT -- docs/design/10-seo-and-content.md, section 1 (binding).
//
// ALL public-facing copy on this site lives in this one file: course
// names, prices, bio text, testimonials, FAQs, CTA labels, and the visible
// text of the legal notices. No component hardcodes a copy string, ever --
// a component that needs text reads it from CONTENT below.
//
// Every placeholder field is a PLACEHOLDER and every one of them carries a
// visible "SAMPLE" marker in its rendered text, so no placeholder can reach
// production unnoticed. Swapping mock content for real content means
// editing EXACTLY THIS FILE (plus the wordmark asset for the visual brand,
// per lib/brand.ts's own notice) -- no component rewrite required.
//
// The business name is never a string literal here or anywhere else; it is
// always imported from lib/brand.ts (the other of the two sanctioned
// homes for the name, see that file's own notice).
// ---------------------------------------------------------------------------

import { businessShortName } from "../lib/brand";

export interface CourseEntry {
  slug: string;
  kind: "law_cert" | "technique_group" | "private_lesson";
  name: string;
  shortDescription: string;
  priceLabel: string;
}

export interface Content {
  hero: {
    headline: string;
    subhead: string;
    ctaLabel: string;
  };
  courses: CourseEntry[];
  about: {
    heading: string;
    bio: string;
  };
  contact: {
    heading: string;
    phone: string;
    email: string;
  };
  footer: {
    legalLine: string;
  };
}

export const CONTENT: Content = {
  hero: {
    headline: "SAMPLE -- Train With Confidence",
    subhead:
      "SAMPLE -- Firearms law, concealed-carry certification, and shooting " +
      "technique instruction in Clearwater, Florida, taught by a former " +
      "military and law-enforcement detective.",
    ctaLabel: "Book a class",
  },
  courses: [
    {
      slug: "concealed-carry-certification",
      kind: "law_cert",
      name: "SAMPLE -- Concealed Carry Certification",
      shortDescription:
        "SAMPLE -- Florida CWL class covering firearms law and a sim-gun " +
        "demonstration. Meets state certification requirements.",
      priceLabel: "SAMPLE -- $89",
    },
    {
      slug: "group-technique-class",
      kind: "technique_group",
      name: "SAMPLE -- Group Technique Class",
      shortDescription:
        "SAMPLE -- Small-group shooting fundamentals: stance, grip, sight " +
        "picture, and safe handling, on a real range.",
      priceLabel: "SAMPLE -- $65 per person",
    },
    {
      slug: "private-lesson",
      kind: "private_lesson",
      name: "SAMPLE -- Private 1:1 Lesson",
      shortDescription:
        "SAMPLE -- One-on-one instruction paced to you, covering anything " +
        "from a first time with a firearm to advanced technique.",
      priceLabel: "SAMPLE -- $150 per hour",
    },
  ],
  about: {
    heading: "SAMPLE -- About " + businessShortName,
    bio:
      "SAMPLE -- Mel spent over two decades in military and law " +
      "enforcement service, including years as a detective, before turning " +
      "to full-time firearms instruction. He teaches the law, the safety " +
      "rules, and the fundamentals the same way he was trained: plainly, " +
      "patiently, and with zero tolerance for shortcuts on safety.",
  },
  contact: {
    heading: "SAMPLE -- Get In Touch",
    phone: "SAMPLE -- (555) 010-0100",
    email: "SAMPLE -- contact@example.com",
  },
  footer: {
    legalLine: `SAMPLE -- ${businessShortName} is a trade name; all classes are booked and invoiced under the legal entity shown on your receipt.`,
  },
};
