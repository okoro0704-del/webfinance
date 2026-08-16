export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "live" || status === "paid"
      ? "bg-brand-50 text-brand-800"
      : status === "failed" || status === "suspended" || status === "cancelled"
        ? "bg-red-50 text-signal-bad"
        : status === "provisioning" || status === "pending" || status === "draft"
          ? "bg-amber-50 text-signal-warn"
          : "bg-ink-50 text-ink-600";

  return <span className={`status-chip ${tone}`}>{status.replace(/_/g, " ")}</span>;
}
