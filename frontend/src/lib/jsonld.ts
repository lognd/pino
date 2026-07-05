// JSON-LD structured-data builders -- docs/design/10-seo-and-content.md
// section 3 ("JSON-LD structured data on every public page"). Pure
// functions only (no React, no DOM) so they can run both client-side (via
// PageMeta's jsonLd prop, see app/layout/PageMeta.tsx) and at build time
// inside scripts/prerender.mjs's SSR entry, without pulling in a browser.
//
// All values are pulled from lib/brand.ts and content/mock.ts (SAMPLE
// values included as-is, per that file's own "SAMPLE" convention) -- never
// a new hardcoded literal, per docs/design/00's business-identity rule and
// docs/design/10 section 1's "no copy hardcoded in a component" rule.

import { businessLegalName } from "./brand";
import type { Content, CourseEntry } from "../content/mock";
import type { MediaItem } from "../content/media";

export interface PostalAddressJsonLd {
  "@type": "PostalAddress";
  streetAddress: string;
}

export interface LocalBusinessJsonLd {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  telephone: string;
  email: string;
  address: PostalAddressJsonLd;
}

export interface OfferJsonLd {
  "@type": "Offer";
  price: string;
  availability: "https://schema.org/InStock";
}

export interface CourseJsonLd {
  "@context": "https://schema.org";
  "@type": "Course";
  name: string;
  description: string;
  provider: { "@type": "Organization"; name: string };
  offers: OfferJsonLd;
}

export interface ImageObjectJsonLd {
  "@type": "ImageObject";
  contentUrl: string;
  name: string;
}

export interface ImageGalleryJsonLd {
  "@context": "https://schema.org";
  "@type": "ImageGallery";
  name: string;
  image: ImageObjectJsonLd[];
}

/** ImageGallery entry for the /gallery page (doc 15) -- one ImageObject per
 * IMAGE manifest item (videos are excluded; ImageGallery.image is images).
 * contentUrl/name come straight from the media manifest's src/alt (SAMPLE
 * values as shipped, per content/media.ts's own SAMPLE convention). */
export function buildImageGalleryJsonLd(
  items: readonly MediaItem[],
  name: string,
): ImageGalleryJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name,
    image: items
      .filter((item) => item.kind === "image")
      .map((item) => ({
        "@type": "ImageObject",
        contentUrl: item.src,
        name: item.alt,
      })),
  };
}

/** LocalBusiness entry for Landing/Contact -- name from brand.ts, contact
 * details from content/mock.ts (SAMPLE address/phone/email as shipped). */
export function buildLocalBusinessJsonLd(contact: Content["contact"]): LocalBusinessJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: businessLegalName,
    telephone: contact.phone,
    email: contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: contact.address,
    },
  };
}

/** Course entry for Courses/CourseDetail -- one per mock.ts CourseEntry.
 * `priceLabel` is a SAMPLE display string (e.g. "SAMPLE -- $89"), not a
 * parsed numeric price -- offers.price carries it through as-is until a
 * real price format lands (see content/mock.ts's own SAMPLE notice). */
export function buildCourseJsonLd(course: CourseEntry): CourseJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.name,
    description: course.shortDescription,
    provider: { "@type": "Organization", name: businessLegalName },
    offers: {
      "@type": "Offer",
      price: course.priceLabel,
      availability: "https://schema.org/InStock",
    },
  };
}
