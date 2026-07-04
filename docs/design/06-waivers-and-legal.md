# 06 -- Waivers & Legal

Audience: anyone building the public legal surface (disclaimers,
eligibility notices, privacy/terms pages), the booking-time eligibility
gate, or the signed-waiver storage flow. Read the root
[README.md](../../README.md) first for product intent. This doc owns the
site's *legal surface* only -- what disclaimers and notices appear, how
eligibility is attested at booking, and how signed waivers are stored.
It does NOT own booking mechanics ([04-booking-and-scheduling.md](04-booking-and-scheduling.md)),
storage internals ([13-storage-abstraction.md](13-storage-abstraction.md)),
or content tone/wording ([10-seo-and-content.md](10-seo-and-content.md)).

> This document is a website-content compliance specification for an
> advertising-and-booking site (disclaimers, eligibility notices, waiver
> handling, commercial-communication rules). **It is not legal advice.**
> Every item that asserts a specific statutory rule is flagged for
> confirmation. Before launch, a licensed Florida attorney and the
> business owner must review this surface. Items needing confirmation are
> marked **VERIFY WITH COUNSEL/MEL**.

## 1. Scope framing

The site advertises and books firearms training. It does **not**:

- deliver or sell firearms or ammunition,
- transfer firearms or run background checks (no FFL activity),
- issue any government license or certification itself.

Almost all real compliance happens **in person, offline**: photo-ID
checks, live-fire safety briefings, range rules, and the training
documentation a student needs for a Florida Concealed Weapon or Firearm
License (CWL) application under F.S. 790.06. None of that is a web
concern.

What the *site* is responsible for is a narrow legal surface:

1. Disclaimers and notices on public pages (section 2).
2. An age/eligibility self-attestation at booking (section 3).
3. Storage of waivers signed on paper (section 4).
4. Required commercial-communication rules for the reminders the
   booking system sends (section 2, SMS/email consent).

Per the README's binding "Current Answers": include only what is free
or required by Clearwater / Florida / Federal law, plus sensible
disclaimers. Do not build a compliance engine the business does not
need.

## 2. Public-site disclaimers and notices

All *wording* of these notices lives in the mock-content module (see
[10-seo-and-content.md](10-seo-and-content.md)) and is marked SAMPLE
until Mel/counsel supply final text. This section specifies *which*
notices must exist and *what* each must convey, not the final prose.

### Not-legal-advice disclaimer

Any page presenting firearms-law course content (course descriptions,
FAQ answers about carry law, blog-style material) carries a clear
"this is educational content, not legal advice; consult a licensed
attorney for your situation" notice. This protects the "law lecture"
framing of the CWL class.

### Eligibility notices

A plain-language notice near CWL course listings and the booking flow
stating who can generally qualify. Known facts to reflect:

- A Florida CWL applicant must generally be **21 or older**, with
  limited exceptions (e.g. certain servicemembers/veterans under
  F.S. 250.01). **VERIFY WITH COUNSEL/MEL** the exact current exception
  language.
- The applicant must be able to **lawfully possess a firearm** (no
  disqualifying convictions or prohibited-person status under state and
  federal law). **VERIFY WITH COUNSEL/MEL** the exact statutory
  citations to name, if any are named at all.
- **VERIFY WITH COUNSEL/MEL:** Florida's 2023 permitless-carry law
  (HB 543) means a CWL is no longer *required* to carry concealed in
  Florida, but the license still matters for reciprocity and other
  purposes. The eligibility notice should not imply the class is legally
  mandatory. Confirm how Mel wants to frame this.
- **VERIFY WITH COUNSEL/MEL:** the 18-20 age question is legally in flux
  (a 2025 Florida circuit-court ruling challenged the under-21 limit).
  Do not hardcode a contested rule as settled -- keep the notice general
  and defer specifics to counsel.

The notice must be advisory only. Actual eligibility is the state's
determination, verified in person; the site never adjudicates it.

### Training-outcome disclaimer

Near CWL course content: "completing this course does not guarantee that
the State of Florida will issue you a license; issuance is decided solely
by the Florida Department of Agriculture and Consumer Services." Course
completion produces training documentation, not a license.

### Assumption-of-risk pointer (live-fire)

Public course pages that involve live-fire mention that participation
carries inherent risk and that a signed waiver is required in person
before any live-fire activity. The *full* assumption-of-risk / liability
waiver text is not published as page copy -- it lives in the versioned
waiver PDF (section 4). The page only points at it. **VERIFY WITH
COUNSEL/MEL:** final waiver language is owned by counsel.

### Privacy policy and terms of service

Booking collects PII (name, email, phone; possibly more). The public
site must carry:

- a **Privacy Policy** page: what is collected, why, how long it is
  kept, who it is shared with (payment processor, email/SMS provider),
  and how to request deletion;
- a **Terms of Service** page: booking, cancellation, refund, and
  conduct terms.

Both are reachable from the footer on every public page (see Test
obligations). Final text is SAMPLE until Mel/counsel supply it.

### SMS/email consent (TCPA / CAN-SPAM)

The booking system sends class reminders by email and/or SMS. This is
commercial/transactional communication and carries federal obligations.
Mirror the sibling repo's mailer design (its CAN-SPAM handling) rather
than reinventing:

- **Consent captured at booking.** Reminder opt-in is an explicit,
  unchecked-by-default choice recorded with the booking (see section 3
  for the storage pattern). Do not send marketing texts/emails without
  captured consent. **VERIFY WITH COUNSEL/MEL:** whether SMS reminders
  are treated as transactional (tied to a booked class) or marketing --
  this affects TCPA consent wording; confirm with counsel.
- **Unsubscribe / STOP.** Every marketing email carries a working
  one-click unsubscribe link; every SMS honors STOP. Opt-out state is
  stored and enforced before any send.
- **Physical mailing address** appears in the footer of commercial
  email (CAN-SPAM requirement). The address is a config value (see
  business-config note below), never hardcoded in a template.
- Honest subject lines and a clear sender identity, per CAN-SPAM.

## 3. Age/eligibility gating at booking

The gate is a **self-attestation checkbox**, not identity verification.
ID verification happens in person; the site only records what the
booker attested.

- At booking, the user checks a required box attesting they meet the
  stated eligibility criteria (e.g. of qualifying age and able to
  lawfully possess a firearm). Exact wording is SAMPLE / counsel-owned.
- The booking cannot be completed if the box is unchecked (see Test
  obligations).
- The attestation is stored **with the booking record**: the attested
  fact, a version identifier for the attestation text shown, and a
  server-side **timestamp**. Schema lives in
  [03-database.md](03-database.md); booking flow lives in
  [04-booking-and-scheduling.md](04-booking-and-scheduling.md).
- Reminder opt-in (section 2) is captured the same way: stored boolean
  + timestamp + version of the consent text.

## 4. Waiver handling

v1 scope is **upload-and-store of paper-signed waivers**. E-signing is
explicitly deferred.

- Waiver templates are **versioned PDF documents**. Each template has a
  stable version identifier so a stored signed waiver can be traced to
  the exact template version the student signed.
- Signed waivers are collected **on paper in person**, then
  scanned/photographed and uploaded through the admin tool.
- Storage goes through the storage abstraction
  ([13-storage-abstraction.md](13-storage-abstraction.md)): local disk
  in dev, Cloudflare R2 in production. Waivers are **private** --
  reachable only by proxying through an authenticated admin route, never
  a public URL (`url()` returns `None` for these keys). Use a namespaced
  key such as `waivers/{student_id}/{session_id}/{filename}`.
- Each stored waiver record links to a **student** and a **session**,
  plus the template version signed and an upload timestamp. Schema in
  [03-database.md](03-database.md).
- **DEFERRED:** electronic signature capture (DocuSign-style / embedded
  e-sign). Flagged as a later decision for Mel -- it changes the legal
  and storage story (audit trail, signer authentication) and is out of
  v1 scope. Record it in Open questions, do not build it.

## 5. Ad-platform note

Firearms-adjacent businesses face advertising restrictions on the major
paid networks (Google Ads and Meta both restrict or prohibit firearms
and firearms-instruction advertising). **VERIFY WITH COUNSEL/MEL:**
exact current policy per platform -- these change often.

Practical consequence for this build: **the site itself is the primary
marketing surface.** Organic reach and local SEO carry the load, not
paid ads. This is why the SEO/content work
([10-seo-and-content.md](10-seo-and-content.md)) is weighted heavily.
This doc only flags the constraint; the content strategy lives in
doc 10.

## Business-name / config note

Per the README's binding requirement, the legal entity name ("Mel Pino,
LLC", short name "Mel Pino"), mailing address, and contact details are
**configuration/content values**, not hardcoded strings. Every place a
notice, email footer, privacy policy, or waiver references the business
name or address pulls it from the designated config/content module (see
[10-seo-and-content.md](10-seo-and-content.md) for the frontend content
module; backend config for server-side email footers). Changing the
business name must never require editing legal-notice source outside
those designated homes.

## Open questions for Mel / counsel

- Final wording for every disclaimer, notice, privacy policy, and terms
  page (all SAMPLE until provided).
- Exact eligibility language, including the 21+ exceptions and the
  permitless-carry / 18-20 framing (all VERIFY items above).
- Final assumption-of-risk / liability waiver text and template
  versioning policy.
- Whether SMS reminders are transactional or marketing (TCPA consent
  wording).
- Business mailing address for CAN-SPAM email footers.
- Whether to pursue e-signature capture later (deferred DocuSign-style
  decision).
- Current Google/Meta firearms-advertising policy and whether any paid
  advertising is attempted at all.

## Test obligations

Detailed strategy lives in the testing-strategy doc; the obligations
this doc imposes:

- **Unit:** a booking is rejected when the eligibility-attestation box
  is not checked; an accepted booking persists the attestation fact +
  version + timestamp.
- **Unit:** a marketing email/SMS send is refused for a recipient with
  no captured consent or an active opt-out.
- **Unit:** waiver upload stores under the correct namespaced,
  non-public key and links to a valid student and session; `url()`
  returns `None` for waiver keys (private).
- **System:** every public page renders footer links to Privacy Policy
  and Terms of Service, and each link resolves to a reachable page.
- **System:** commercial email rendered by the mailer includes an
  unsubscribe link and the configured physical mailing address.

## What NOT to put here

- Booking flow, cancellation, seat/waitlist logic ->
  [04-booking-and-scheduling.md](04-booking-and-scheduling.md).
- Storage backend internals, R2/local details, caching ->
  [13-storage-abstraction.md](13-storage-abstraction.md).
- Content tone, page copy, SEO, and mock-content conventions ->
  [10-seo-and-content.md](10-seo-and-content.md).
- Table/column definitions for bookings, attestations, waivers ->
  [03-database.md](03-database.md).
