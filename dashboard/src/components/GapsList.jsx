import { AlertTriangle, CheckCircle2, MessageSquare, TrendingUp } from "lucide-react";

const ICONS = {
  "Strong matches": CheckCircle2,
  Gaps: AlertTriangle,
  "Angles to emphasize": TrendingUp,
  "Outreach talking points": MessageSquare,
};

const LIST_STYLES = {
  "Strong matches": "text-green-700 marker:text-green-600",
  Gaps: "text-amber-700 marker:text-amber-600",
  "Angles to emphasize": "text-blue-700 marker:text-blue-600",
  "Outreach talking points": "text-purple-700 marker:text-purple-600",
};

function BulletCard({ title, items }) {
  const Icon = ICONS[title];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <ul className={`mt-3 list-disc space-y-2 pl-5 text-sm ${LIST_STYLES[title]}`}>
        {items?.length ? items.map((item) => <li key={item}>{item}</li>) : <li className="text-gray-400 marker:text-gray-300">No data yet</li>}
      </ul>
    </section>
  );
}

export default function GapsList({ strongMatches, gaps, anglesToEmphasize, outreachTalkingPoints }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <BulletCard title="Strong matches" items={strongMatches} />
      <BulletCard title="Gaps" items={gaps} />
      <BulletCard title="Angles to emphasize" items={anglesToEmphasize} />
      <BulletCard title="Outreach talking points" items={outreachTalkingPoints} />
    </div>
  );
}
