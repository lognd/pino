// Plain-text "Back to home" backlink -- docs/design/09-design-system.md's
// binding backlink-home rule: the wordmark-logo link alone is not enough for
// this (mostly elderly, first-time) audience, so every tokenized/dead-end page
// carries an explicit, underlined text link home near the top. One home for
// the markup + copy so every page's backlink stays identical.

import { Link } from "react-router-dom";
import { CONTENT } from "../content/mock";

/** A left-arrow "Back to home" text link. Underlined always (color is never
 * the only affordance, doc 09), body-size, high contrast. */
export function BackHomeLink({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2 text-lg font-semibold text-mp-white underline underline-offset-4 hover:text-mp-red-text${
        className ? ` ${className}` : ""
      }`}
    >
      <span aria-hidden="true">&larr;</span>
      {CONTENT.backToHomeLabel}
    </Link>
  );
}
