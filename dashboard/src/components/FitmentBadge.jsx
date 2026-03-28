const STYLE_MAP = {
  high: "border-green-200 bg-green-50 text-green-700",
  mid: "border-yellow-200 bg-yellow-50 text-yellow-700",
  low: "border-red-200 bg-red-50 text-red-700",
  none: "border-gray-200 bg-gray-50 text-gray-500",
};

function getFitMeta(score) {
  let label = "Fit pending";
  let shortLabel = "--";
  let style = STYLE_MAP.none;

  if (typeof score === "number") {
    if (score >= 8) {
      label = `High Fit • ${score}/10`;
      shortLabel = "High";
      style = STYLE_MAP.high;
    } else if (score >= 5) {
      label = `Medium Fit • ${score}/10`;
      shortLabel = "Medium";
      style = STYLE_MAP.mid;
    } else {
      label = `Low Fit • ${score}/10`;
      shortLabel = "Low";
      style = STYLE_MAP.low;
    }
  }

  return { label, shortLabel, style };
}

export default function FitmentBadge({ score, variant = "default" }) {
  const { label, shortLabel, style } = getFitMeta(score);

  if (variant === "table") {
    if (typeof score !== "number") {
      return <span className="text-xs font-semibold tabular-nums text-gray-400">--</span>;
    }

    return (
      <div className="inline-flex min-w-[112px] items-center justify-between gap-2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-1">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}>
          {shortLabel}
        </span>
        <span className="text-xs font-semibold tabular-nums text-gray-700">
          {score}/10
        </span>
      </div>
    );
  }

  return <span className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}
