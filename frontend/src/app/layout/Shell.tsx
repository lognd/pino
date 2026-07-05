// Page chrome: nav + footer, wraps every route. Black ground, top nav
// (wordmark image linking home + sr-only business name, plain large text
// links, red "Book a class" CTA), footer with legal links + business legal
// name + SAMPLE physical address (CAN-SPAM note, doc 06). All copy from
// content/mock.ts; business name from lib/brand.ts.
//
// RESPONSIVE NAV (user feedback 2026-07-05): below lg the link row is
// flattened into a single MENU button that expands into a stacked panel
// (Courses/Gallery/About/Contact + the red CTA) -- no wrapped/overlapping
// links at narrow widths, ever. Plain "MENU"/"CLOSE" text instead of a
// hamburger glyph: the audience is elderly (doc 00), words beat icons.
// Disclosure semantics (aria-expanded/aria-controls), Escape closes, route
// change closes, every item is a >= 48px tap target.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { businessLegalName, businessShortName } from "../../lib/brand";
import { CONTENT } from "../../content/mock";
import { useBulletholeClicks } from "../../hero/useBulletholeClicks";
import { StaticWordmark } from "../../hero/Wordmark";

const NAV_LINK =
  "text-lg font-semibold text-mp-white underline-offset-4 hover:underline";

// text-xl (20px) + font-bold is required, not decorative: white-on-mp-red
// only measures 4.19:1 (below the 4.5:1 AA gate for normal-size text), so
// this pairing is only compliant at WCAG "large text" size (>= 18.66px
// bold); text-lg (18px) fell just short and tripped axe color-contrast
// (doc 09's "check every new pairing").
const CTA_LINK =
  "inline-block min-h-[48px] bg-mp-red px-4 py-2 text-xl font-bold uppercase text-mp-white hover:bg-mp-red-press";

/** The four plain nav items, one source for both layouts (NO DUPLICATION). */
const NAV_ITEMS = [
  CONTENT.nav.courses,
  CONTENT.nav.gallery,
  CONTENT.nav.about,
  CONTENT.nav.contact,
];

export function Shell({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  // Decorative bullet-hole click feedback on nav/footer links
  // (docs/design/08 Revision 2): pointer-events-none portal, no-op under
  // reduced motion, never delays navigation. Overlay rendered once below.
  const { overlay, bulletProps } = useBulletholeClicks();
  // Backlink-home rule (doc 09, REVISED round 3): the home affordance is the
  // MEL PINO wordmark logo at the VERY LEFT, shown on every page EXCEPT the
  // landing route (where the hero already owns the lockup -- no duplicate
  // logo in the bar there). The plain-text "Home" nav item is removed.
  const location = useLocation();
  const onLanding = location.pathname === CONTENT.nav.home.path;

  const [menuOpen, setMenuOpen] = useState(false);
  // Route change closes the expanded menu (navigation happened).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  // Escape closes it (standard disclosure behavior).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-mp-black text-mp-white">
      <header className="border-b-2 border-mp-border px-4 py-4">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4"
        >
          {/* Wordmark-logo home link -- shown on every page except landing
              (doc 09's revised backlink rule). ALWAYS mounted and opacity-
              faded instead of unmounted: navigating home used to blink the
              logo away instantly, which read as jarring. While on landing
              it is invisible, non-interactive, and out of the a11y tree. */}
          <Link
            to={CONTENT.nav.home.path}
            className={`flex min-w-0 items-center gap-2 transition-opacity duration-500 ${
              onLanding ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
            aria-hidden={onLanding || undefined}
            tabIndex={onLanding ? -1 : undefined}
            {...bulletProps}
          >
            {/* Inline StaticWordmark, not the <img> asset: the backlink
                logo must be EXACTLY the landing lockup (same letters,
                same webfont, uncracked) -- an <img> SVG cannot use the
                page font. Explicit aspect + height (no auto sizing). */}
            <StaticWordmark className="aspect-[48/19] h-10" />
            <span className="sr-only">{businessShortName} -- home</span>
          </Link>

          {/* Full link row: lg and up only (it wraps/overlaps below that). */}
          <ul className="hidden items-center gap-6 lg:flex">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <Link to={item.path} className={NAV_LINK} {...bulletProps}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to={CONTENT.nav.book.path} className={CTA_LINK} {...bulletProps}>
                {CONTENT.nav.book.label}
              </Link>
            </li>
          </ul>

          {/* Flattened menu button: below lg every option lives in the
              expanding panel underneath, so nothing can overlap. */}
          <button
            type="button"
            className="min-h-[48px] border-2 border-mp-border px-5 py-2 text-xl font-bold uppercase text-mp-white hover:border-mp-white lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mp-nav-menu"
            onClick={() => setMenuOpen((v) => !v)}
            {...bulletProps}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </nav>

        {/* Expanded mobile panel: stacked, full-width, >=48px tap targets. */}
        <div
          id="mp-nav-menu"
          className={`${menuOpen ? "block" : "hidden"} lg:hidden`}
        >
          <ul className="mx-auto mt-4 flex max-w-6xl flex-col border-t-2 border-mp-border pt-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`${NAV_LINK} block min-h-[48px] py-3`}
                  {...bulletProps}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link
                to={CONTENT.nav.book.path}
                className={`${CTA_LINK} w-full text-center`}
                {...bulletProps}
              >
                {CONTENT.nav.book.label}
              </Link>
            </li>
          </ul>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t-2 border-mp-border px-4 py-8 text-lg text-mp-muted">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-6">
              {CONTENT.footer.legalLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="underline hover:text-mp-white"
                    {...bulletProps}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p>{CONTENT.footer.legalLine}</p>
          {/* SAMPLE physical mailing address -- required in commercial email
              footers by CAN-SPAM (doc 06); shown here too so the address is
              a real, visible config value rather than only living in an
              email template. */}
          <p>{CONTENT.footer.addressLine}</p>
          <p>
            &copy; {year} {businessLegalName}
          </p>
        </div>
      </footer>
      {overlay}
    </div>
  );
}
