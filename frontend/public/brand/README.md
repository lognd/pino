# Brand assets

`wordmark.svg` is a PLACEHOLDER lockup, not the real mark. See
`docs/design/08-landing-hero.md` for the real spec: the production
asset must be hand-traced with ~12-20 id'd shard polygons (`shard-*`)
so `src/hero/Wordmark.tsx` can drive the reactive shatter/recombine
effect as a pure function of scrub progress. The wordmark is the one
sanctioned exception to the "no hardcoded business name" rule in
`docs/design/00-overview.md` -- replacing the brand means replacing
this asset, not editing a component.

TODO(impl) P1: commission/trace the real shard-split SVG.
