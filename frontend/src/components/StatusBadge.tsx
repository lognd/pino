// Status is text + color, never a bare dot -- docs/design/09-design-system.md.
// The colored chip is decorative reinforcement; the word itself carries
// the meaning, so this reads fine with color vision deficiency or in
// grayscale.

export type Status = "paid" | "unpaid" | "partial" | "confirmed" | "pending" | "waitlisted";

export interface StatusBadgeProps {
  status: Status;
}

const LABEL: Record<Status, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  partial: "Partially paid",
  confirmed: "Confirmed",
  pending: "Pending",
  waitlisted: "Waitlisted",
};

// doc 09: --mp-success for paid/confirmed, --mp-warn for pending/waitlist,
// --mp-red reserved for unpaid (an action-needed state), never bare color.
const COLOR: Record<Status, string> = {
  paid: "border-mp-success text-mp-success",
  confirmed: "border-mp-success text-mp-success",
  pending: "border-mp-warn text-mp-warn",
  waitlisted: "border-mp-warn text-mp-warn",
  partial: "border-mp-warn text-mp-warn",
  unpaid: "border-mp-red-text text-mp-red-text",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block border-2 px-3 py-1 text-lg font-semibold uppercase ${COLOR[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
