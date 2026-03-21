function TagList({ title, items }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-mist/60">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items?.length ? (
          items.map((item) => (
            <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-sm text-mist">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-mist/60">No data yet</span>
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
    <div className="grid gap-4 lg:grid-cols-2">
      <TagList title="Must-have skills" items={mustHaveSkills} />
      <TagList title="Nice-to-have skills" items={niceToHaveSkills} />
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-mist/60">Experience</h3>
        <p className="mt-3 text-sm text-mist">{experienceYears || "Not specified"}</p>
      </div>
      <TagList title="Culture signals" items={cultureSignals} />
      <TagList title="Red flags" items={redFlags} />
    </div>
  );
}

