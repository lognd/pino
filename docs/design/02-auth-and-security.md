# 02 -- Auth & Security

Audience: anyone building login, sessions, booking tokens, rate
limiting, or CSRF. Read [00-overview.md](00-overview.md) first. This
doc is the single source of truth for security mechanics; feature docs
reference it instead of re-deciding.

## Threat model

Three actor classes:

- **Admin** (Mel + Logan; a small fixed set of accounts): full access.
  Password login, server-side sessions, identical mechanics to
  logand.app (crib `backend/src/logand_backend/auth/` wholesale).
- **Guest booker** (the public): NO accounts, NO passwords, ever.
  The audience is elderly first-time computer users; a forced
  registration wall is a product failure. Identity = the booking
  itself, authenticated by a signed manage link (below).
- **Attacker**: seat-squatting (mass fake bookings to fill classes),
  card testing on the payment surface, scraping student PII, session
  theft. The unauthenticated booking endpoint is the largest new
  surface relative to logand.app and gets the tightest limits.

## Admin sessions (copy logand.app verbatim)

- Postgres-backed sessions, 256-bit `secrets.token_urlsafe(32)` token,
  SHA-256 hashed at rest, `__Host-session` cookie (HttpOnly, Secure,
  SameSite=Strict, Path=/).
- Sliding idle timeout 12h (admin-only system; no customer sessions
  exist here at all), absolute lifetime 7 days.
- Revocation by row delete + a "kill all sessions" admin endpoint.
- Argon2id (time_cost=3, memory_cost=64MB, parallelism=4), length
  8..128, no composition rules.
- CSRF double-submit bound to the session's csrf_secret -- copy
  logand's middleware including its hard-won ordering/rollback lessons
  (see logand `app/app.py` comments).

## Guest booking tokens (NEW -- melpino's one auth invention)

When a booking is created, mint a 256-bit random manage token:

- Stored SHA-256-hashed on the booking row (`manage_token_hash`).
  The raw token exists only in the confirmation email/page URL:
  `/booking/{token}` -> frontend calls
  `GET /api/bookings/manage/{token}`.
- Grants access to exactly one booking: view details, cancel (inside
  the cancellation window, see 04), re-send confirmation. Nothing
  else -- not other bookings by the same email, no PII beyond what the
  booker themselves entered.
- Expiry: token stays valid until 30 days after the session's end
  (people check details after class), then lookups return
  `BookingError.TokenInvalid`.
- Lookup failures are ALWAYS `TokenInvalid` -> 404, never "expired vs.
  wrong" -- do not confirm a booking exists to someone guessing.
- No login, no password reset, no account recovery flows exist for
  guests. Lost the email? The site says "call/email us" (admin can
  look the booking up and re-send the link) -- a human fallback is the
  correct UX for this audience, not a self-service recovery maze.
- Constant-time comparison is irrelevant (we compare SHA-256 digests
  via DB lookup, same as logand sessions) but tokens must never be
  logged -- log booking ids, not tokens.

## Rate limiting (Redis token bucket, copy logand's limiter)

Per IP unless noted:

- Admin login: 5 / 15 min, exponential backoff per IP+email pair.
- `POST /api/bookings` (create): 5 / hour -- a human books once or
  twice; only abuse books more. Plus a hidden honeypot form field
  (bots fill it, humans never see it) rejected server-side. NO
  CAPTCHA: the elderly-first bar rules it out; honeypot + rate limit +
  email confirmation is the defense stack.
- `GET /api/bookings/manage/{token}`: 30 / hour (token guessing).
- Payment endpoints: 20 / min (mirror logand).
- Public reads (courses, sessions, config): 120 / min -- session
  listings get polled by the booking UI.
- Admin API: 300 / min.
- Always 429 + `Retry-After`; the frontend shows a real countdown.

Redis unavailable -> in-process fallback with logged warning (copy
logand's `redis_url=None` semantics and its comment about why the
default is None, not a plausible-looking URL).

## PII handling

Bookings store name, email, phone, party size, attestation flag --
nothing else (see [03-database.md](03-database.md)). No DOB, no SSN,
no license numbers: eligibility verification happens in person
([06-waivers-and-legal.md](06-waivers-and-legal.md)). Waiver scans are
PII-dense -> private storage keys only, streamed through authenticated
admin routes, never public URLs (see
[13-storage-abstraction.md](13-storage-abstraction.md)).

## Secrets handling

Identical hard rules to logand.app: `.env` never read by any agent,
directly or indirectly; placeholders only in `backend/.env.example`;
GitHub Actions secrets never echoed. Secret inventory lives in
`docs/secrets.md` (names + rotation, never values).

## Authorization model

Two roles: `admin`, `staff` (staff = future assistant instructors;
same permissions as admin at v1 EXCEPT user management and payment
refunds -- cheap to declare now, one enum value + two route guards,
and saves a migration later). Router functions declare
`Depends(require_admin)` / `Depends(require_staff)`; guest routes
declare nothing and authenticate via the manage token path parameter.
Booking-scoped access is enforced in `domain/booking/service.py` by
token-hash lookup, never by trusting a client-supplied booking id.

## Test obligations

Session expiry/revocation, CSRF rejection, Argon2id round-trip: copy
logand's coverage. New, melpino-specific, all REQUIRED:

- Manage-token round trip: create booking -> token from email fetches
  it; wrong token 404s; token after expiry window 404s.
- Token not logged: grep the captured log output in the system test.
- Honeypot: filled honeypot field -> rejected, no booking row.
- Rate limit: 6th booking attempt in an hour -> 429 + Retry-After.
- Cross-booking isolation: token A cannot fetch/cancel booking B.

See [12-testing-strategy.md](12-testing-strategy.md) for layer
placement.

## What NOT to put here

- Booking lifecycle/capacity -> [04-booking-and-scheduling.md](04-booking-and-scheduling.md)
- Schema -> [03-database.md](03-database.md)
- Legal attestation content -> [06-waivers-and-legal.md](06-waivers-and-legal.md)
