// Guest manage/cancel-booking journey via signed token -- resolves the
// token server-side; renders a friendly 404 in plain language if expired
// per docs/design/07-frontend-architecture.md's route guards section.
//
// TODO(impl): docs/design/04-booking-and-scheduling.md

import { useParams } from "react-router-dom";

export function ManageBooking() {
  const { token } = useParams<{ token: string }>();
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Manage your booking
      </h1>
      {/* TODO(impl): docs/design/04-booking-and-scheduling.md */}
      <p className="text-lg text-mp-muted">Token: {token}</p>
    </main>
  );
}
