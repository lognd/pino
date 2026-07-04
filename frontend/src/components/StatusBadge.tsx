// Status is text + color, never a bare dot -- docs/design/09-design-system.md.
//
// TODO(impl): docs/design/09-design-system.md

export type Status = "paid" | "unpaid" | "partial" | "confirmed" | "pending" | "waitlisted";

export interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  // TODO(impl): docs/design/09-design-system.md -- map status to
  // --mp-success/--mp-warn/--mp-red per doc 09's status-color rules.
  return (
    <span className="border-2 border-mp-border px-2 py-1 text-lg font-semibold uppercase text-mp-white">
      {status}
    </span>
  );
}
