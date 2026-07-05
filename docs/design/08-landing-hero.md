# 08 -- Landing Hero

Audience: whoever builds the landing hero -- the headline interaction
of the whole site. Read [00-overview.md](00-overview.md) and
[09-design-system.md](09-design-system.md) first. This is the piece
the root README says to **prototype first and in isolation**: build it
inside `frontend/src/hero/` with a standalone Vite playground route
(`/hero-lab`, dev-only) before touching the real Landing page.

## The effect, described precisely

Behind the MEL PINO wordmark runs a slow-motion firing sequence
(muzzle flash blooming, slide cycling, casing ejecting, smoke
drifting). It does not autoplay like a video: the viewer's horizontal
cursor position scrubs it.

REVISION 2 (binding user feedback, 2026-07-04): the first
implementation read as "flash game" -- the blast and casing appeared
from nowhere, edge-to-edge activation felt indiscriminate, and the
shatter was too uniform. The following are now hard requirements:

- **The shot comes from somewhere.** Draw NO weapon imagery at all --
  no handgun, no silhouette (user clarification, twice: the fix is
  not adding a gun). The failure was that the casing and flash
  appeared from nowhere, mid-field. Fix: one consistent OFF-FRAME ORIGIN just outside one
  side of the hero (pick a point ~10% beyond the frame edge, barrel
  height). Everything is motivated by it: the muzzle flash is light
  SPILLING IN from that edge (directional bloom + rim light raking
  across the wordmark, brightest at the origin edge, not a centered
  fireball), the casing ENTERS FRAME from that origin with a
  believable ballistic arc and tumble, and the smoke drifts in from
  the same edge. A viewer should read "something fired just
  off-screen" without seeing it.
- **Professional finish over spectacle.** Fewer, softer, better:
  layered bloom with a hot white core and brief red rim, subtle film
  grain/vignette over the whole hero field, no confetti-like sparks.
  If a detail cannot be made to look deliberate, cut it.
- REVISION 3 (user verdict on the first Revision-2 pass: casing and
  flash "still look childish"): both need a real art-direction pass.
  The FLASH: no cartoon starburst -- a 2-3 frame-equivalent sliver of
  the timeline where exposure blows out (whole field lifts), a hot
  elongated core with proper falloff (inverse-square-ish gradient
  stops, slight horizontal anamorphic stretch), a one-frame red rim,
  then instant decay into drifting smoke + lingering rim light. The
  CASING: small, fast, and specular -- correct relative scale (a 9mm
  case is TINY against a viewport wordmark; err small), rendered as
  a brass-toned capsule with a bright specular glint line and rim
  highlight, motion-stretched along its velocity when moving fast,
  visible tumble via its silhouette (foreshortened ellipse cycle),
  entering hot and decelerating believably. Palette exception
  granted: a desaturated brass (one muted gold tone) is permitted
  for the casing only. If after honest effort the casing still reads
  cheap, drop it below the fold of perception (near-subliminal
  speed/size) rather than shipping a cartoon.

- Cursor maps to progress across an INNER ACTIVE BAND, not the full
  viewport: the band spans the central region of the hero, inset at
  least 15% of hero width from each side (tune in /hero-lab). Cursor
  left of the band clamps to 0, right of it clamps to 1; vertical
  position is ignored but the pointer must be over the hero section
  at all for scrubbing to engage. Move right, the shot advances;
  move left, it reverses.
- The mapping is EASED, not linear: cursor position feeds a target
  progress; displayed progress chases it with critically-damped
  smoothing (spring or exponential smoothing, ~200-350ms settle) so
  motion feels weighty, never twitchy. Fast mouse sweeps produce a
  fast-but-smooth scrub, micro-jitters produce nothing visible.
- Idle (no pointer movement for 3s, pointer left the hero, or touch
  devices where there is no hover): REVISION 3 -- progress eases
  slowly (4-6s, ease-out) back to 0, ALWAYS (not "nearest extreme":
  the right extreme is now the held-shattered state, so settling
  right would freeze the logo broken). The wordmark visibly DRIFTS
  BACK TOGETHER on inaction, every time. At rest the hero stays
  subtly alive through ambient smoke/grain only -- no progress
  movement. Any pointer movement inside the active band blends back
  to cursor control over ~500ms (no snap). Touch devices: one slow
  pass on load (0 -> 1 over ~8s), then the same settle back to 0.
- **Reactive wordmark**: the lockup shatters and recombines on the
  same timeline. Define `SHOT_MOMENT` (progress value where the
  muzzle flash peaks, e.g. 0.35). As progress crosses outward from
  SHOT_MOMENT the wordmark's fragments fly apart (translate + rotate,
  slight scale, motion-blur-suggesting opacity falloff), with
  per-fragment random vectors seeded once (stable across frames).
  Shatter envelope (REVISION 3 -- supersedes the earlier tent rule;
  binding user feedback): the shatter PERSISTS at the right extreme.
  `shatter(p) = 0 for p <= SHOT_MOMENT`, then rises
  (`smoothstep((p - SHOT_MOMENT) / (1 - SHOT_MOMENT))`) to FULL
  displacement at p = 1 and stays there. Pixel-perfect reassembly is
  required ONLY at p = 0. Scrubbing left reassembles (still a pure
  function of progress); parking the cursor full-right leaves the
  lockup blown apart -- that is the point. Idle settle-home
  consequently ALWAYS targets 0 (see the idle rule), so "on
  inaction, MEL PINO comes back together." Touch intro becomes
  0 -> 1 -> settle back to 0. See `frontend/src/hero/shards.ts`. As progress returns,
  fragments recombine. It is a pure function of progress -- scrubbing
  backward reassembles it exactly; there is NO independent timer loop.

## Architecture: one interface, two sources (the swap contract)

We do not have real footage yet. Simulate first; when Mel's real
240fps clip arrives, it must drop in without touching the scrub, the
wordmark, or the page. Therefore:

```ts
// hero/timeline.ts
export interface ScrubSource {
  /** Prepare assets; resolve when frame 0 is displayable. */
  init(canvas: HTMLCanvasElement): Promise<void>;
  /** Render the frame for progress in [0, 1]. Must be pure w.r.t.
   *  progress: same value in, same pixels out (this is what makes
   *  reverse scrubbing free). */
  render(progress: number): void;
  /** Static poster for reduced-motion / pre-init / no-JS. */
  posterUrl(): string;
  dispose(): void;
}
```

- `hero/sources/simulated.ts` -- **SimulatedSource** (v1): procedural
  canvas 2D (WebGL only if 2D provably can't hit budget) rendering of
  a stylized sequence: black field; at SHOT_MOMENT a red/white muzzle
  bloom (layered radial gradients + spark streaks), a casing arc
  (parametric path, progress-indexed), drifting smoke (a few pre-
  seeded soft particles whose positions are FUNCTIONS of progress,
  not integrated per-frame -- purity rule above). Stylized and
  graphic-novel-bold beats photoreal-and-cheesy: match the brand
  (black/red/white only, see 09). All randomness seeded once at init.
- `hero/sources/video.ts` -- **VideoSource** (ready, stubbed): a
  preloaded muted `<video>`, `render(p)` sets
  `currentTime = p * duration` (rVFC-synced draw to canvas, or direct
  element scrub if seek latency allows). Spec notes for the future
  clip: 2-4s of 240fps, H.265/AV1 + H.264 fallback, keyframe-dense
  encode (`-g 1` or near) because scrubbing is random access; hosted
  via R2 (see [13-storage-abstraction.md](13-storage-abstraction.md)).
  Selection: `VITE_HERO_SOURCE=simulated|video` + video URL in config;
  default simulated.
- `hero/useScrub.ts` -- pointer -> eased progress (the smoothing +
  idle-drift state machine above), one rAF loop owned here and
  nowhere else. Exposes `progress` to both the source and the
  wordmark so they can never desync.
- `hero/Wordmark.tsx` -- inline SVG lockup (MEL in red, PINO in
  white, heavy condensed italic per 09) pre-split into shard
  polygons; a pure `progress -> transform` map per shard. Fragments
  must reassemble to a pixel-perfect lockup at progress 0 (Revision
  3: the right extreme stays shattered).
  REVISION 3 shatter-quality bar (supersedes Revision 2's plain
  radial tessellation -- user verdict: "just lines", not good
  enough): the crack network must be BRANCHY AND FRACTAL-LIKE, real
  broken-glass morphology, not spokes. Generate recursively and
  deterministically (seeded once): primary cracks radiate from the
  impact point with per-segment angular jitter (each crack is a
  POLYLINE of 3-6 kinked segments, never one straight line);
  each primary spawns 1-3 SECONDARY branches at random points along
  its length, deviating 20-45deg, shorter; secondaries may spawn
  tertiaries near the impact. Shards are the cells of this branched
  network (near-impact cells small and splintery, periphery large
  slabs). RENDER THE CRACKS: during shatter, hairline strokes
  (mp-white at low alpha, brighter near impact) trace the network on
  the lockup as separation grows -- the visible branching is what
  sells glass. Per-shard motion keeps Revision 2's stagger/rotation/
  scale/opacity depth cues along the (now kinked) radial paths.
  Purity and determinism rules unchanged; identity now required at
  p = 0 only (see the envelope rule above).
- `hero/Bullethole.tsx` + `hero/useBulletholeClicks.ts` (Revision 2,
  NEW) -- click feedback for interactive elements site-wide: on
  pointerdown on an opted-in element (nav links, CTA buttons), spawn
  a brief bullet-hole-in-glass effect AT the click point: dark core,
  white-hot rim, 5-8 radiating crack lines with slight randomness
  (seeded per click position), fading out over ~600ms. Implemented as
  a portal overlay (never intercepts events, pointer-events: none;
  the underlying navigation/click proceeds untouched -- if the effect
  ever delays navigation it is wrong). Respects
  prefers-reduced-motion (no effect at all). Exported from hero/ but
  wired into Shell/BigButton by the app layer, so hero/ stays
  standalone. Zero effect on a11y: purely decorative, aria-hidden.
- `hero/Hero.tsx` -- composition + lazy init + fallback logic.

## Degradation ladder (each rung REQUIRED)

1. `prefers-reduced-motion`: render `posterUrl()` + static wordmark.
   No scrub, no drift, no shatter. Full stop.
2. No JS / before lazy chunk loads: the poster image + static SVG
   lockup are in the prerendered HTML (see 07) -- the page is
   readable and branded with zero hero code.
3. Touch/keyboard (no hover): idle drift only; page NEVER hijacks
   touch scrolling for scrubbing.
4. Low-power devices: if two consecutive seconds average < 30fps,
   drop to poster + a one-line log (`lib/logging.ts`). Never spin a
   fan to show a logo.

## Performance budget (hard numbers, tested)

- Hero JS chunk (simulated source + scrub + wordmark): <= 60KB gzip.
- Steady-state scrub: 60fps on a 2019 mid-range laptop, zero
  per-frame allocations in the render path (pre-allocate; the purity
  rule makes this natural).
- Landing LCP unaffected by hero init (poster paints first; source
  init happens after, behind `requestIdleCallback`).

## Acceptance criteria (the prototype demo checklist)

- Scrub right/left advances/reverses smoothly; parking full-right
  holds the lockup shattered; releasing the pointer anywhere parks
  briefly, then the sequence settles back to 0 and the wordmark
  visibly reassembles (Revision 3 idle rule).
- The crack pattern reads as branched broken glass (kinked polyline
  cracks with secondary/tertiary branches, hairlines rendered during
  separation) -- never straight spokes.
- The blast reads as fired from a consistent point just off-frame
  (directional spill, casing entry, smoke all agree on the origin);
  no weapon imagery is drawn. Scrub only engages inside the inset
  active band.
- Clicking a nav link/CTA leaves a fading bullet-hole/glass-crack at
  the click point without delaying navigation (and never under
  reduced motion).
- Wordmark shatter is fully deterministic under back-and-forth
  scrubbing (record progress=0.6 twice, identical pixels).
- Toggling `VITE_HERO_SOURCE` swaps simulated -> (stub) video with
  zero changes outside `hero/sources/`.
- All four degradation rungs demonstrable.
- axe: hero region is `aria-hidden` decoration; the H1 with the
  business name exists in DOM text for screen readers/SEO
  independent of the visual wordmark (see 10).

## Test obligations

Unit (Vitest): easing/idle state machine (pointer sequences ->
expected progress curves), shard transform purity, source selection
logic. System (Playwright): reduced-motion renders poster; landing
paints H1 before hero chunk loads; fps guard log path. Visual polish
is reviewed by a human -- do not attempt pixel-diff tests of the
simulation. See [12-testing-strategy.md](12-testing-strategy.md).

## Open questions for Mel

- License/shoot a real 240fps clip (what firearm, what angle, black
  backdrop?) -- until then simulated ships.
- Sound: deliberately NONE (autoplaying gunshot audio is hostile);
  confirm Mel agrees.

## What NOT to put here

- Brand tokens/type -> [09-design-system.md](09-design-system.md)
- Page structure/SEO -> [07](07-frontend-architecture.md) / [10](10-seo-and-content.md)
