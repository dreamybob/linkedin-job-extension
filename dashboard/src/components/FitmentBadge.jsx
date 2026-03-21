const STYLE_MAP = {
  high: "border-electric/40 bg-electric/15 text-electric",
  mid: "border-amberline/40 bg-amberline/15 text-amberline",
  low: "border-danger/40 bg-danger/15 text-danger",
  none: "border-white/15 bg-white/5 text-mist/70",
};

export default function FitmentBadge({ score }) {
  let label = "Analysing...";
  let style = STYLE_MAP.none;

  if (typeof score === "number") {
    if (score >= 8) {
      label = `Strong Fit · ${score}/10`;
      style = STYLE_MAP.high;
    } else if (score >= 5) {
      label = `Partial Fit · ${score}/10`;
      style = STYLE_MAP.mid;
    } else {
      label = `Weak Fit · ${score}/10`;
      style = STYLE_MAP.low;
    }
  }

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}

