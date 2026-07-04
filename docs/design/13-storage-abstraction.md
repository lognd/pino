# 13 -- Storage Abstraction

Audience: anyone touching file storage (waivers, course PDFs, hero
media, payment proofs). Normative reference: logand.app's
`docs/design/13-storage-abstraction.md` + its implementation
(`domain/storage/base.py` Protocol, `local.py`, `r2.py`,
`factory.py`) -- copy the Protocol VERBATIM (put/get/delete/exists/
url, key-not-URL semantics, `url() -> None` means proxy-through-API,
Protocol-not-ABC reasoning) and the local/R2 backends. This doc lists
melpino's uses and rules only.

## Backends

`STORAGE_BACKEND=local` (default, dev) | `r2` (production --
Cloudflare R2 is locked, per root README). Same config fields as
logand ([01-backend-architecture.md](01-backend-architecture.md)).

## Key namespaces (the complete list -- add here first)

```
waivers/{student_id}/{waiver_id}.{ext}      -- PRIVATE. Legal PII.
                                               url() must never return
                                               a public URL; admin
                                               routes stream bytes.
payment-proofs/{invoice_id}/{proof_id}.{ext}-- PRIVATE (copy logand).
course-media/{course_slug}/*                -- public-ok (photos,
                                               syllabus PDFs).
brand/hero/*                                -- public: the future real
                                               hero clip + poster
                                               (see 08), long
                                               cache-control, immutable
                                               keys (hash-suffixed).
```

Private vs public is a property of the NAMESPACE, not per-call
judgment: `r2_public_base_url` handling must check the key prefix
against the allowlist above (`course-media/`, `brand/`) and return
None for everything else even when a public base is configured --
this is a one-function guard in `factory.py`/`r2.py` plus a unit
test, and it is the one behavioral addition to logand's copied code.

## Backup interaction

The nightly backup tarballs the whole local storage volume / syncs
the R2 bucket (see [11-deployment.md](11-deployment.md)). Waivers
make this legally load-bearing -- restore runbook must be exercised
before first real booking (TODO.md gate).

## Test obligations

Copy logand's storage suite (local round-trip, moto-backed R2,
missing-key, idempotent delete) + the namespace-privacy guard test
(waivers key + configured public base -> url() is None). See
[12-testing-strategy.md](12-testing-strategy.md).
