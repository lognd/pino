# Brand assets

`wordmark.svg` is a PLACEHOLDER lockup, not the real mark. See
`docs/design/08-landing-hero.md` for the real spec: the production
asset must be hand-traced with ~12-20 id'd shard polygons (`shard-*`)
so `src/hero/Wordmark.tsx` can drive the reactive shatter/recombine
effect as a pure function of scrub progress. The wordmark is the one
sanctioned exception to the "no hardcoded business name" rule in
`docs/design/00-overview.md` -- replacing the brand means replacing
this asset, not editing a component.

`hero-poster.svg` is the static hero fallback frame (reduced-motion /
pre-init / low-power) referenced by `SimulatedSource.posterUrl()`. Its
glyphs are the SAME placeholder lockup and get replaced alongside
`wordmark.svg` when the traced asset lands.

The reactive fracture in `src/hero/Wordmark.tsx` is an INLINE-SVG
component (not this file): it tiles the field into 16 shard triangles and
transforms each per scrub progress. This `wordmark.svg` remains only for
the no-JS/prerender path.

TODO(impl) P1: commission/trace the real shard-split SVG.
