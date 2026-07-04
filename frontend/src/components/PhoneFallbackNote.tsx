// "If this doesn't work, call us" fallback note -- the elderly-first
// safety net threaded through the booking/manage/pay flows per the root
// README's binding constraint (booking must be as easy as possible).
//
// TODO(impl): docs/design/10-seo-and-content.md

import { CONTENT } from "../content/mock";

export function PhoneFallbackNote() {
  return (
    <p className="text-lg text-mp-muted">
      {/* TODO(impl): docs/design/10-seo-and-content.md */}
      Having trouble? Call us at {CONTENT.contact.phone}.
    </p>
  );
}
