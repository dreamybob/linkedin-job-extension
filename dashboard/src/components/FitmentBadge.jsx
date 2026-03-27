const STYLE_MAP = {
  high: "border-green-200 bg-green-50 text-green-700",
  mid: "border-yellow-200 bg-yellow-50 text-yellow-700",
  low: "border-red-200 bg-red-50 text-red-700",
  none: "border-gray-200 bg-gray-50 text-gray-500",
};

export default function FitmentBadge({ score }) {
  let label = "Fit pending";
  let style = STYLE_MAP.none;

  if (typeof score === "number") {
    if (score >= 8) {
      label = `High Fit • ${score}/10`;
      style = STYLE_MAP.high;
    } else if (score >= 5) {
      label = `Medium Fit • ${score}/10`;
      style = STYLE_MAP.mid;
    } else {
      label = `Low Fit • ${score}/10`;
      style = STYLE_MAP.low;
    }
  }

  return <span className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}
