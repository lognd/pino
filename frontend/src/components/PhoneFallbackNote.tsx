// "If this doesn't work, call us" fallback note -- the elderly-first
// safety net threaded through the booking/manage/pay flows per the root
// README's binding constraint (booking must be as easy as possible). The
// phone number is a real tappable tel: link, not plain text, so it works
// on a phone with one tap.

import { CONTENT } from "../content/mock";

export function PhoneFallbackNote() {
  return (
    <p className="text-lg text-mp-muted">
      Having trouble? Call us at{" "}
      <a href={`tel:${CONTENT.contact.phone}`} className="font-semibold text-mp-white underline">
        {CONTENT.contact.phone}
      </a>
      .
    </p>
  );
}
