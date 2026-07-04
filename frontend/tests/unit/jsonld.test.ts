import { describe, expect, it } from "vitest";
import { buildLocalBusinessJsonLd, buildCourseJsonLd } from "../../src/lib/jsonld";
import { CONTENT } from "../../src/content/mock";
import { businessLegalName } from "../../src/lib/brand";

// docs/design/10-seo-and-content.md section 3: "JSON-LD structured data
// on every public page ... LocalBusiness ... Course". These assert the
// shape lib/jsonld.ts's builders produce is a valid-looking schema.org
// object built only from content/mock.ts + lib/brand.ts (never a new
// hardcoded literal).
describe("lib/jsonld.ts", () => {
  describe("buildLocalBusinessJsonLd", () => {
    const result = buildLocalBusinessJsonLd(CONTENT.contact);

    it("uses the schema.org LocalBusiness type", () => {
      expect(result["@context"]).toBe("https://schema.org");
      expect(result["@type"]).toBe("LocalBusiness");
    });

    it("pulls name from brand.ts, contact details from content/mock.ts as-is", () => {
      expect(result.name).toBe(businessLegalName);
      expect(result.telephone).toBe(CONTENT.contact.phone);
      expect(result.email).toBe(CONTENT.contact.email);
      expect(result.address).toEqual({
        "@type": "PostalAddress",
        streetAddress: CONTENT.contact.address,
      });
    });

    it("is JSON-serializable (no functions/undefined leaking into output)", () => {
      expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
      const roundTripped = JSON.parse(JSON.stringify(result));
      expect(roundTripped).toEqual(result);
    });
  });

  describe("buildCourseJsonLd", () => {
    for (const course of CONTENT.courses) {
      it(`builds a valid Course entry for ${course.slug}`, () => {
        const result = buildCourseJsonLd(course);

        expect(result["@context"]).toBe("https://schema.org");
        expect(result["@type"]).toBe("Course");
        expect(result.name).toBe(course.name);
        expect(result.description).toBe(course.shortDescription);
        expect(result.provider).toEqual({ "@type": "Organization", name: businessLegalName });
        expect(result.offers).toEqual({
          "@type": "Offer",
          price: course.priceLabel,
          availability: "https://schema.org/InStock",
        });
      });
    }

    it("produces a distinct entry per course (no shared-reference bugs)", () => {
      const [first, second] = CONTENT.courses.map(buildCourseJsonLd);
      expect(first.name).not.toBe(second.name);
    });
  });
});
