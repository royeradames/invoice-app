import { statusLabel, type Status } from "../lib/invoices.ts";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={"badge " + status}>
      <span className="badge-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
