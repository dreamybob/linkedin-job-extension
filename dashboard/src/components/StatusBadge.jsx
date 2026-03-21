const STATUS_STYLES = {
  pending: "border-white/20 bg-white/5 text-mist/70",
  processing: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  done: "border-electric/30 bg-electric/10 text-electric",
  error: "border-danger/30 bg-danger/10 text-danger",
};

export default function StatusBadge({ status }) {
  const label = status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {label}
    </span>
  );
}

