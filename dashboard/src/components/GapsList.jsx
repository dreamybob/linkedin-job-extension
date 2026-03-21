function BulletCard({ title, items }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-mist/60">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-mist/90">
        {items?.length ? items.map((item) => <li key={item}>• {item}</li>) : <li className="text-mist/60">No data yet</li>}
      </ul>
    </section>
  );
}

export default function GapsList({ strongMatches, gaps, anglesToEmphasize, outreachTalkingPoints }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BulletCard title="Strong matches" items={strongMatches} />
      <BulletCard title="Gaps" items={gaps} />
      <BulletCard title="Angles to emphasize" items={anglesToEmphasize} />
      <BulletCard title="Outreach talking points" items={outreachTalkingPoints} />
    </div>
  );
}

