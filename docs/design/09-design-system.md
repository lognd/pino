# 09 -- Design System

Audience: anyone making visual decisions. Read
[00-overview.md](00-overview.md) first. Single source of truth for
look-and-feel -- no independent aesthetic calls in feature work.
melpino does NOT inherit logand.app's terminal/ASCII aesthetic; only
its *discipline* (tokens as CSS variables, accessibility as a hard
gate, one orchestrated motion moment per page).

## Core directive: hard-edged, black-ground, red/white -- that anyone's
## grandmother can use

Mel's word for the brand is "manly": black ground, blunt red/white
wordmark, heavy condensed type, high contrast, zero rounded-corner
softness. The reference artifact is the MEL PINO lockup mockup
(see `frontend/public/brand/` once the SVG asset lands): "MEL" in
red, "PINO" in white, heavy condensed italic on black.

The counterweight (binding, from the root README): most students are
elderly, tech-illiterate, first-time computer users. Wherever
hard-edged and usable conflict, **usable wins**. Concretely: the
aesthetic lives in color, type, and edges -- never in small text,
low-contrast grays, hidden controls, or clever interactions.

## Color tokens (styles/tokens.css)

```css
:root {
  --mp-black:      #0A0A0B;  /* page ground -- near-black, not #000,
                                so pure-black hero media reads deeper */
  --mp-black-true: #000000;  /* hero field + wordmark lockup ground */
  --mp-surface:    #161618;  /* cards, panels */
  --mp-white:      #F4F4F2;  /* primary text -- warm off-white */
  --mp-muted:      #9A9A96;  /* secondary text -- AA on --mp-black only
                                at >= 18px; never for body copy */
  --mp-red:        #E8112D;  /* THE brand red: CTAs, "MEL", accents */
  --mp-red-press:  #C00E26;  /* pressed/hover CTA state */
  --mp-border:     #2A2A2E;
  --mp-success:    #3FA34D;  /* paid/confirmed -- always with a text label */
  --mp-warn:       #E5A50A;  /* pending/waitlist -- always with a label */
}
```

Red is an ACCENT: on any screen, red covers well under 10% of pixels
(CTAs, the MEL half of the lockup, status moments). A page that reads
"red site" is wrong; the site is black-and-white with red muscle.
White text on `--mp-red` fails AA at body sizes -- red-filled buttons
therefore always use bold >= 18px text (large-text AA passes at
4.02:1; verify) or white-on-black with a red border. Check every new
pairing; do not assume.

Light theme: none. This brand is dark by identity, not by trend. The
tokens still go through CSS variables so a future variant is an
override, not a rewrite.

## Typography

Two families total, one superfamily -- both Google Fonts, self-hosted
via `@fontsource` (no third-party font CDN at runtime):

- **Display: Barlow Condensed, weight 800-900, italic** -- H1/H2,
  section headers, the wordmark's textual siblings. This is the
  closest free face to the mockup's heavy condensed italic. ALL-CAPS
  for display use, tight tracking (`-0.01em`), never below 28px.
- **Body/UI: Barlow (regular width), 400/600** -- everything else.
  Body minimum **18px** (not 16 -- elderly bar), line-height 1.6,
  max measure 70ch. Form labels 600 weight, never lighter than
  `--mp-white`.

The wordmark itself is an SVG asset, not live text (see
[08-landing-hero.md](08-landing-hero.md)); an sr-only/H1 text
equivalent always accompanies it.

## Shape & texture

- Border-radius: **0** everywhere. Buttons, cards, inputs, images.
  The single sanctioned exception: focus rings may follow browser
  defaults.
- Edges do the talking: 2px borders, hard offset shadows
  (`4px 4px 0 #000`-style) if depth is needed -- never soft blur
  glows.
- Diagonal cuts (a `clip-path` slant on section dividers and the
  red CTA band) echo the wordmark's italic lean -- use the SAME angle
  everywhere: `--mp-skew: -8deg`.
- Photography treatment (when real photos land): high-contrast,
  desaturated toward black/white with red kept only if naturally
  present; duotone black/red for decorative shots.

## Buttons & controls (the elderly-first contract)

- Primary action: one per screen, red fill, white bold 20px+ label,
  min height **56px**, full-width on mobile. Verbs in plain words:
  "Book this class", "Cancel my booking", never "Submit"/"Proceed".
- Secondary: white 2px outline on black, same size. Tertiary/link:
  underlined always (color is never the only affordance).
- Tap targets >= 48x48px, >= 8px apart. Focus visible: 3px red
  outline + 2px offset on every focusable element.
- Forms: one column, labels ABOVE fields, 18px+ input text, explicit
  inline errors in words ("Please type your email address -- it looks
  incomplete"), no placeholder-as-label, no multi-column grids, no
  select2-style widgets -- native controls, big.
- Status is text + color, never a bare dot ("PAID" chip, "4 seats
  open").
- No hover-only reveals, no auto-advancing carousels, no toasts for
  errors a user must act on (inline, persistent), no timeouts that
  discard a half-filled form.

## Motion

- One orchestrated Motion moment per route (hero on Landing; a
  single staggered reveal elsewhere), CSS transitions for micro
  states. `prefers-reduced-motion` collapses everything to fades or
  stills -- the hero has its own ladder
  ([08-landing-hero.md](08-landing-hero.md)).
- Nothing meaningful is conveyed ONLY by motion.

## Accessibility gate (CI-enforced, see 12)

WCAG AA minimum, tested with axe on every public page: zero
critical/serious. Manual checklist per release: keyboard-only booking
run-through; 200% zoom without horizontal scroll; screen-reader pass
over the booking flow. The persona test: "could a 75-year-old on a
2015 iPad, alone, book Saturday's class in under three minutes?" --
if a design choice makes that worse, the choice is wrong.

## What NOT to put here

- Hero internals -> [08-landing-hero.md](08-landing-hero.md)
- Copy/voice -> [10-seo-and-content.md](10-seo-and-content.md)
- Component/file layout -> [07-frontend-architecture.md](07-frontend-architecture.md)
