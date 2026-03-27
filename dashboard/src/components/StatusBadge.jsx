import { AlertCircle, CheckCircle2, Clock3, Loader2 } from "lucide-react";

const STATUS_STYLES = {
  pending: "border-gray-200 bg-gray-50 text-gray-600",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  done: "border-green-200 bg-green-50 text-green-700",
  error: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_ICONS = {
  pending: Clock3,
  processing: Loader2,
  done: CheckCircle2,
  error: AlertCircle,
};

export default function StatusBadge({ status }) {
  const label = status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
  const Icon = STATUS_ICONS[status] || Clock3;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] || STATUS_STYLES.pending
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}
