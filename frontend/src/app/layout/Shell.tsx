// Page chrome: nav + footer, wraps every route. Black ground, top nav
// (wordmark image linking home + sr-only business name, plain large text
// links, red "Book a class" CTA), footer with legal links + business legal
// name + SAMPLE physical address (CAN-SPAM note, doc 06). All copy from
// content/mock.ts; business name from lib/brand.ts.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { businessLegalName, businessShortName } from "../../lib/brand";
import { CONTENT } from "../../content/mock";

const NAV_LINK =
  "text-lg font-semibold text-mp-white underline-offset-4 hover:underline";

export function Shell({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen flex-col bg-mp-black text-mp-white">
      <header className="border-b-2 border-mp-border px-4 py-4">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4"
        >
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/wordmark.svg" alt="" className="h-10 w-auto" />
            <span className="sr-only">{businessShortName} -- home</span>
          </Link>
          <ul className="flex flex-wrap items-center gap-6">
            <li>
              <Link to={CONTENT.nav.courses.path} className={NAV_LINK}>
                {CONTENT.nav.courses.label}
              </Link>
            </li>
            <li>
              <Link to={CONTENT.nav.about.path} className={NAV_LINK}>
                {CONTENT.nav.about.label}
              </Link>
            </li>
            <li>
              <Link to={CONTENT.nav.contact.path} className={NAV_LINK}>
                {CONTENT.nav.contact.label}
              </Link>
            </li>
            <li>
              <Link
                to={CONTENT.nav.book.path}
                className="inline-block min-h-[48px] bg-mp-red px-4 py-2 text-lg font-bold uppercase text-mp-white hover:bg-mp-red-press"
              >
                {CONTENT.nav.book.label}
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t-2 border-mp-border px-4 py-8 text-lg text-mp-muted">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-6">
              {CONTENT.footer.legalLinks.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="underline hover:text-mp-white">
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
    </div>
  );
}
