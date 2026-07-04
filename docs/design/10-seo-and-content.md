# 10 -- SEO & Content

Audience: anyone building the public marketing pages, writing copy, or
adding the metadata/structured-data layer. Read the root
[README.md](../../README.md) first for product intent. This doc owns
*content* (where copy lives, the public information architecture, SEO,
and voice/tone). It does NOT own visual design
([09-design-system.md](09-design-system.md)), the hero interaction
([08-hero-interaction.md](08-hero-interaction.md)), or the ownership of
legal text ([06-waivers-and-legal.md](06-waivers-and-legal.md)).

## 1. Mock-content convention (binding)

Per the README's binding "Current Answers": ship **mock content, clearly
marked, extendable later.** The rule:

- **ALL** copy lives in one typed module, `frontend/src/content/mock.ts`,
  exporting a single `CONTENT` object. This covers course names, prices,
  bio text, testimonials, FAQs, CTA labels, and the visible text of the
  legal notices whose *existence* is specified in
  [06-waivers-and-legal.md](06-waivers-and-legal.md).
- **No copy is hardcoded inside components, ever.** A component that
  needs text reads it from `CONTENT`. This is a hard rule, not a
  preference.
- Every field that is a placeholder carries a visible **"SAMPLE"** marker
  in its rendered text (e.g. `"SAMPLE -- Florida CWL Class"`), so no
  placeholder can reach production unnoticed.
- The module opens with a banner comment stating that everything in it is
  placeholder content to be replaced, and that swapping mock for real
  content means editing **exactly this one file**.
- The business name ("Mel Pino, LLC", short name "Mel Pino") and other
  identity values live here too (or in a small sibling config the module
  imports), so a name change touches one place -- honoring the README's
  "VERY EASILY configurable" requirement. Nothing references the business
  name as a string literal in a component.

This single-file discipline is what makes the whole site's content
swappable later without a component rewrite.

## 2. Public-site information architecture

Suggested route set for the public, unauthenticated surface. Admin
routes are out of scope here.

- **Landing** -- hero (see [08-hero-interaction.md](08-hero-interaction.md)),
  course cards, a credibility strip (Mel's background at a glance), and a
  primary CTA ("Book a class").
- **Courses** -- the catalog:
  - Florida CWL / concealed-carry certification class (law lecture +
    sim-gun demo);
  - group technique classes;
  - 1:1 premium instruction.
  Each course card carries name, short description, and price (all SAMPLE
  until real values arrive).
- **About** -- Mel's bio and credentials (former military /
  law-enforcement detective). SAMPLE bio until the real one is provided.
- **Contact** -- how to reach the business.
- **Book** -- the booking flow itself; see
  [04-booking-and-scheduling.md](04-booking-and-scheduling.md). This doc
  does not specify booking mechanics.
- **Legal pages** -- Privacy Policy, Terms of Service, and any
  disclaimers; existence and content requirements owned by
  [06-waivers-and-legal.md](06-waivers-and-legal.md). Reachable from the
  footer on every public page.

## 3. SEO

The site is the primary marketing surface (paid firearms advertising is
restricted; see [06-waivers-and-legal.md](06-waivers-and-legal.md),
section 5), so organic and local SEO carry real weight.

- **Local-business focus.** Target local intent queries such as
  "concealed carry class Clearwater FL", "Florida CWL class near me",
  and similar. Location (Clearwater, Florida) appears in real page copy,
  titles, and structured data -- not just meta tags.
- **JSON-LD structured data** (`<script type="application/ld+json">`) on
  every public page:
  - `LocalBusiness` on the landing/contact pages (name, address, phone,
    geo, hours -- pulled from the content/config module);
  - `Course` and/or `Event` schema for scheduled classes, so search
    engines can surface class offerings and dates.
- **Real server-visible content.** Mirror the sibling repo's approach
  conceptually: public routes serve real, semantic HTML (prerender / SSG
  at build time), not a blank SPA shell that only fills in via
  client-side JS. Crawlers and AI agents get the same content a human
  sees. The hero's visual/simulation layer is decoration on top of real
  markup, never a replacement for it. Admin routes stay client-rendered
  behind auth -- no SEO concern.
- **Site files at root:** `sitemap.xml` (generated at build from the
  known public route list), `robots.txt` (allow crawlers on public
  routes, disallow admin/API paths), and `llms.txt` (concise
  markdown summary of the business, its classes, and key public links --
  the emerging AI-agent-readable convention).
- **Per-route metadata:** one `<h1>` per page with a real heading
  hierarchy; a human-written `<meta name="description">` per route;
  Open Graph + Twitter Card tags per route using the `MEL PINO`
  wordmark card image; `<link rel="canonical">` per route.

## 4. Voice and tone

- Hard-edged, plainspoken, confident, **safety-serious**. This matches
  the brand ([09-design-system.md](09-design-system.md)) without
  bleeding into it -- doc 9 owns the look, this owns the words.
- **No gun-culture cliches. No fearmongering.** The pitch is competence
  and safety, not fear or bravado.
- **Short sentences.** Direct statements. Plain words over jargon.
- Reading level tuned for the **elderly-first accessibility bar** (see
  [09-design-system.md](09-design-system.md)) -- the README notes most
  students are older and not tech-savvy. Copy must be legible to a
  first-time, non-technical, older reader on the first pass.

## 5. Content accessibility rules (overlap with doc 9)

Visual specifics belong to [09-design-system.md](09-design-system.md);
the content-side rules this doc enforces:

- Body text **minimum 16px, 18px preferred**.
- **Plain-language CTAs.** "Book a class" -- never "Get started",
  "Explore", or other vague verbs. A CTA says exactly what happens next.
- Link text is descriptive on its own (no "click here").

## Open questions for Mel

- Real bio and credentials text (replacing the SAMPLE About copy).
- Photos of Mel / the range / classes (real imagery to replace
  placeholders).
- Real course names, descriptions, and **prices**.
- Testimonials, and **written permission** to publish each named
  testimonial.
- Business hours, address, and phone for `LocalBusiness` structured data.

## Test obligations

Detailed strategy lives in the testing-strategy doc; obligations this
doc imposes:

- **System:** every public page serves non-empty, meaningful HTML
  (prerendered content present without JS execution) -- guards against
  the blank-SPA-shell failure mode.
- **System:** JSON-LD on each public page validates against its schema
  type.
- **Accessibility:** an automated axe scan runs against every public
  page and passes (no critical violations).
- **Lint/guard:** a check that no user-facing string literal is
  hardcoded in a component (all copy flows through `CONTENT`) -- at
  minimum documented as a review obligation if not automated.

## What NOT to put here

- Visual design, palette, type scale, spacing ->
  [09-design-system.md](09-design-system.md).
- Hero interaction / firing-sequence scrub behavior ->
  [08-hero-interaction.md](08-hero-interaction.md).
- Ownership and final wording of legal text (disclaimers, privacy,
  terms) -> [06-waivers-and-legal.md](06-waivers-and-legal.md). This doc
  only specifies *where* that text lives (the content module) and that
  it is SAMPLE until provided.
- Booking flow mechanics -> [04-booking-and-scheduling.md](04-booking-and-scheduling.md).
