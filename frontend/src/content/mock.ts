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
//
// Legal-page drafts below are SAMPLE-marked per docs/design/06-waivers-and-
// legal.md -- every one of them is a placeholder pending review by a
// licensed Florida attorney and the business owner (Mel). Do not treat any
// legal copy in this file as final.
// ---------------------------------------------------------------------------

import { businessLegalName, businessShortName } from "../lib/brand";

export interface CourseEntry {
  slug: string;
  kind: "law_cert" | "technique_group" | "private_lesson";
  name: string;
  shortDescription: string;
  longDescription: string;
  priceLabel: string;
  /** True for courses that involve live-fire, per doc 06's
   * assumption-of-risk pointer requirement. */
  liveFire: boolean;
}

export interface NavEntry {
  label: string;
  path: string;
}

export interface LegalPageEntry {
  slug: "privacy" | "terms" | "disclaimers";
  title: string;
  sampleNotice: string;
  sections: { heading: string; body: string }[];
}

export interface RouteMeta {
  title: string;
  description: string;
}

export interface Content {
  meta: {
    landing: RouteMeta;
    courses: RouteMeta;
    about: RouteMeta;
    contact: RouteMeta;
    book: RouteMeta;
    legal: Record<LegalPageEntry["slug"], RouteMeta>;
  };
  nav: {
    home: NavEntry;
    courses: NavEntry;
    about: NavEntry;
    contact: NavEntry;
    book: NavEntry;
  };
  hero: {
    headline: string;
    subhead: string;
    ctaLabel: string;
  };
  courses: CourseEntry[];
  credibility: {
    heading: string;
    items: string[];
  };
  ctaBand: {
    heading: string;
    body: string;
    ctaLabel: string;
  };
  about: {
    heading: string;
    bio: string;
    credentials: string[];
  };
  contact: {
    heading: string;
    intro: string;
    phone: string;
    email: string;
    address: string;
  };
  book: {
    comingSoonHeading: string;
    comingSoonNote: string;
  };
  notices: {
    notLegalAdvice: string;
    eligibility: string;
    trainingOutcome: string;
    assumptionOfRisk: string;
  };
  legalPages: LegalPageEntry[];
  footer: {
    legalLine: string;
    addressLine: string;
    legalLinks: NavEntry[];
  };
}

const notLegalAdvice =
  "SAMPLE -- This page describes educational course content and is not " +
  "legal advice. For questions about your own situation, talk to a " +
  "licensed attorney.";

const eligibility =
  "SAMPLE -- Florida's concealed weapon license generally requires an " +
  "applicant to be 21 or older and legally able to possess a firearm. " +
  "There are limited exceptions. This notice is general information, not " +
  "a ruling on your eligibility -- the State of Florida makes that " +
  "decision when you apply. (Pending counsel review.)";

const trainingOutcome =
  "SAMPLE -- Completing this course does not guarantee that the State of " +
  "Florida will issue you a license. Only the Florida Department of " +
  "Agriculture and Consumer Services decides that. This course gives you " +
  "the training documentation the application asks for.";

const assumptionOfRisk =
  "SAMPLE -- This class includes live-fire shooting, which carries real " +
  "risk. You will sign a waiver in person before any live-fire activity " +
  "begins. (Pending counsel review of final waiver language.)";

export const CONTENT: Content = {
  meta: {
    landing: {
      title: `${businessShortName} -- Firearms Training in Clearwater, FL`,
      description:
        "SAMPLE -- Firearms law, concealed-carry certification, and " +
        "shooting technique instruction in Clearwater, Florida.",
    },
    courses: {
      title: `Courses -- ${businessShortName}`,
      description:
        "SAMPLE -- Concealed-carry certification, group technique classes, " +
        "and private 1:1 instruction in Clearwater, Florida.",
    },
    about: {
      title: `About -- ${businessShortName}`,
      description:
        "SAMPLE -- Meet your instructor: a former military and " +
        "law-enforcement detective teaching firearms safety in " +
        "Clearwater, Florida.",
    },
    contact: {
      title: `Contact -- ${businessShortName}`,
      description: "SAMPLE -- Call or email to book a class or ask a question.",
    },
    book: {
      title: `Book a Class -- ${businessShortName}`,
      description: "SAMPLE -- Booking is coming soon. Call us to reserve a seat.",
    },
    legal: {
      privacy: {
        title: `Privacy Policy -- ${businessShortName}`,
        description: "SAMPLE -- How we collect, use, and protect your information.",
      },
      terms: {
        title: `Terms of Service -- ${businessShortName}`,
        description: "SAMPLE -- Booking, cancellation, and conduct terms.",
      },
      disclaimers: {
        title: `Disclaimers -- ${businessShortName}`,
        description: "SAMPLE -- Legal notices about our courses and training.",
      },
    },
  },
  nav: {
    home: { label: "Home", path: "/" },
    courses: { label: "Courses", path: "/courses" },
    about: { label: "About", path: "/about" },
    contact: { label: "Contact", path: "/contact" },
    book: { label: "Book a class", path: "/book" },
  },
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
      longDescription:
        "SAMPLE -- This class is a classroom law lecture plus a sim-gun " +
        "safety demonstration. You will learn what Florida law says about " +
        "carrying, storing, and using a firearm, and you will leave with " +
        "the training documentation a Florida CWL application asks for. " +
        notLegalAdvice,
      priceLabel: "SAMPLE -- $89",
      liveFire: false,
    },
    {
      slug: "group-technique-class",
      kind: "technique_group",
      name: "SAMPLE -- Group Technique Class",
      shortDescription:
        "SAMPLE -- Small-group shooting fundamentals: stance, grip, sight " +
        "picture, and safe handling, on a real range.",
      longDescription:
        "SAMPLE -- A small-group, hands-on class covering stance, grip, " +
        "sight picture, and safe handling on a live range. Paced for " +
        "first-time shooters as well as anyone wanting a refresher. " +
        assumptionOfRisk,
      priceLabel: "SAMPLE -- $65 per person",
      liveFire: true,
    },
    {
      slug: "private-lesson",
      kind: "private_lesson",
      name: "SAMPLE -- Private 1:1 Lesson",
      shortDescription:
        "SAMPLE -- One-on-one instruction paced to you, covering anything " +
        "from a first time with a firearm to advanced technique.",
      longDescription:
        "SAMPLE -- One-on-one instruction, scheduled from published " +
        "openings, paced entirely to you -- from a first time holding a " +
        "firearm to advanced technique work. " + assumptionOfRisk,
      priceLabel: "SAMPLE -- $150 per hour",
      liveFire: true,
    },
  ],
  credibility: {
    heading: "SAMPLE -- Why Train With Mel",
    items: [
      "SAMPLE -- Over two decades of military and law-enforcement service",
      "SAMPLE -- Former detective",
      "SAMPLE -- Hundreds of students certified for Florida's concealed weapon license",
      "SAMPLE -- Patient, plain-spoken teaching for first-time shooters",
    ],
  },
  ctaBand: {
    heading: "SAMPLE -- Ready to book a class?",
    body: "SAMPLE -- Classes fill up. Reserve your seat today, or call us and we will book it for you.",
    ctaLabel: "Book a class",
  },
  about: {
    heading: "SAMPLE -- About " + businessShortName,
    bio:
      "SAMPLE -- Mel spent over two decades in military and law " +
      "enforcement service, including years as a detective, before turning " +
      "to full-time firearms instruction. He teaches the law, the safety " +
      "rules, and the fundamentals the same way he was trained: plainly, " +
      "patiently, and with zero tolerance for shortcuts on safety.",
    credentials: [
      "SAMPLE -- Former military service member",
      "SAMPLE -- Former law-enforcement detective",
      "SAMPLE -- Florida CWL certified instructor",
      "SAMPLE -- Years of range safety instruction experience",
    ],
  },
  contact: {
    heading: "SAMPLE -- Get In Touch",
    intro:
      "SAMPLE -- The easiest way to reach us is by phone. Call and we can " +
      "answer questions or book your class right there.",
    phone: "SAMPLE -- (555) 010-0100",
    email: "SAMPLE -- contact@example.com",
    address: "SAMPLE -- 100 Main Street, Clearwater, FL 33755",
  },
  book: {
    comingSoonHeading: "SAMPLE -- Online Booking Is Coming Soon",
    comingSoonNote:
      "SAMPLE -- Online booking is not open yet. Call us and we will book " +
      "your class over the phone.",
  },
  notices: {
    notLegalAdvice,
    eligibility,
    trainingOutcome,
    assumptionOfRisk,
  },
  legalPages: [
    {
      slug: "privacy",
      title: "SAMPLE -- Privacy Policy",
      sampleNotice: "SAMPLE -- pending counsel review",
      sections: [
        {
          heading: "SAMPLE -- What we collect",
          body:
            "SAMPLE -- When you book a class, we collect your name, email, " +
            "phone number, and party size. Payment details are handled by " +
            "our payment processor; we do not store card numbers.",
        },
        {
          heading: "SAMPLE -- How we use it",
          body:
            "SAMPLE -- We use your information to confirm your booking, " +
            "send class reminders, and answer questions. We do not sell " +
            "your information.",
        },
        {
          heading: "SAMPLE -- How long we keep it",
          body:
            "SAMPLE -- We keep booking records as long as needed for " +
            "business and legal record-keeping, then delete them.",
        },
        {
          heading: "SAMPLE -- Requesting deletion",
          body:
            "SAMPLE -- To request deletion of your information, call us or " +
            "email us using the contact details on our Contact page.",
        },
      ],
    },
    {
      slug: "terms",
      title: "SAMPLE -- Terms of Service",
      sampleNotice: "SAMPLE -- pending counsel review",
      sections: [
        {
          heading: "SAMPLE -- Booking",
          body:
            "SAMPLE -- Booking a class reserves your seat. Some classes " +
            "require a deposit at booking; the rest is due in person.",
        },
        {
          heading: "SAMPLE -- Cancellation",
          body:
            "SAMPLE -- You can cancel online up until 24 hours before your " +
            "class starts. After that, please call us.",
        },
        {
          heading: "SAMPLE -- Conduct",
          body:
            "SAMPLE -- Range safety rules are followed at all times. " +
            `${businessLegalName} may refuse service to anyone who does not ` +
            "follow safety instructions.",
        },
      ],
    },
    {
      slug: "disclaimers",
      title: "SAMPLE -- Disclaimers",
      sampleNotice: "SAMPLE -- pending counsel review",
      sections: [
        { heading: "SAMPLE -- Not legal advice", body: notLegalAdvice },
        { heading: "SAMPLE -- Eligibility", body: eligibility },
        { heading: "SAMPLE -- Training outcome", body: trainingOutcome },
        { heading: "SAMPLE -- Assumption of risk", body: assumptionOfRisk },
      ],
    },
  ],
  footer: {
    legalLine: `SAMPLE -- ${businessShortName} is a trade name; all classes are booked and invoiced under the legal entity shown on your receipt.`,
    addressLine: "SAMPLE -- 100 Main Street, Clearwater, FL 33755",
    legalLinks: [
      { label: "Privacy Policy", path: "/legal/privacy" },
      { label: "Terms of Service", path: "/legal/terms" },
      { label: "Disclaimers", path: "/legal/disclaimers" },
    ],
  },
};
