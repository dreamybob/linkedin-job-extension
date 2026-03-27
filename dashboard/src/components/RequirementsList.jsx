import { AlertTriangle, Clock3, Sparkles } from "lucide-react";

function TagList({ title, items, tone = "default" }) {
  const styles =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-gray-200 bg-gray-50 text-gray-700";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items?.length ? (
          items.map((item) => (
            <span key={item} className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-400">No data yet</span>
        )}
      </div>
    </div>
  );
}

export default function RequirementsList({
  mustHaveSkills,
  niceToHaveSkills,
  experienceYears,
  cultureSignals,
  redFlags,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TagList title="Must-have skills" items={mustHaveSkills} />
      <TagList title="Nice-to-have skills" items={niceToHaveSkills} />
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Experience</h3>
        </div>
        <p className="mt-3 text-sm text-gray-700">{experienceYears || "Not specified"}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Culture signals</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {cultureSignals?.length ? (
            cultureSignals.map((item) => (
              <span key={item} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {item}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-400">No data yet</span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h3 className="text-lg font-semibold text-gray-900">Red flags</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {redFlags?.length ? (
            redFlags.map((item) => (
              <span key={item} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                {item}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-400">No data yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
