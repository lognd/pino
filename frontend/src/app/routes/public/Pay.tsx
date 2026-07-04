// Guest invoice-pay flow via signed token --
// docs/design/05-payments-and-invoicing.md.
//
// TODO(impl): docs/design/05-payments-and-invoicing.md

import { useParams } from "react-router-dom";

export function Pay() {
  const { token } = useParams<{ token: string }>();
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Pay your invoice
      </h1>
      {/* TODO(impl): docs/design/05-payments-and-invoicing.md */}
      <p className="text-lg text-mp-muted">Token: {token}</p>
    </main>
  );
}
