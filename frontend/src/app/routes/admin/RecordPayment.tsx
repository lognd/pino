// Record payment (/admin/invoices/:invoiceId/pay) --
// docs/design/14-admin-mockup.md.
//
// TODO(impl): docs/design/14-admin-mockup.md

import { useParams } from "react-router-dom";
import { SampleBanner } from "../../../components/SampleBanner";

export function AdminRecordPayment() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  return (
    <main>
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Record payment: {invoiceId}
      </h1>
      {/* TODO(impl): docs/design/14-admin-mockup.md */}
    </main>
  );
}
