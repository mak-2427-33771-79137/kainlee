import { pageUser, pageEvent, allowed } from '@/lib/page';
import { loadEventData } from '@/lib/stats';
import { AGE_LABEL, fmtDate, fmtHrs } from '@/lib/util';
import { can } from '@/lib/rbac';
import NoAccess from '@/components/NoAccess';
import ExportMenu from '@/components/ExportMenu';
import { AutoRefresh } from '@/components/Live';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catering' };

export default async function Catering({ params }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  if (!allowed(user, 'catering.view')) return <NoAccess what="catering numbers" />;
  const invs = await loadEventData(ev.id);
  const data = ev.functions.map((f) => {
    const g = { adult: { veg: 0, nonveg: 0 }, child: { veg: 0, nonveg: 0 }, infant: { veg: 0, nonveg: 0 } };
    const notes = {};
    let present = 0;
    for (const inv of invs) for (const m of inv.members) {
      const mf = m.functions[f.id];
      if (mf?.attendance === 'present') present++;
      if (!mf?.attending || m.is_walkin) continue;
      g[m.age_group][m.meal]++;
      if (m.meal_note) { const k = m.meal_note.trim().toLowerCase(); notes[k] = (notes[k] || 0) + 1; }
    }
    const tot = (a) => g[a].veg + g[a].nonveg;
    return { f, g, tot, notes: Object.entries(notes).sort((a, b) => b[1] - a[1]), present, total: tot('adult') + tot('child') + tot('infant') };
  });
  return (
    <>
      <AutoRefresh every={60} />
      <div className="top">
        <div style={{ flex: 1 }}><div className="lbl">{ev.name}</div><h1>Catering</h1></div>
        {can(user.role, 'export.catering') && <ExportMenu eventId={ev.id} reports={[['catering', 'Catering sheet']]} />}
      </div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))' }}>
        {data.map(({ f, g, tot, notes, total, present }, i) => (
          <section key={f.id} className="card3 band tilt3 stack" style={{ padding: '20px 16px 14px', animationDelay: `${i * 0.08}s` }}>
            <div><div className="lbl">{fmtDate(f.starts_at)} · {fmtHrs(f.starts_at)}</div><h2 className="go" style={{ fontSize: 26 }}>{f.name}</h2></div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}><span className="go num" style={{ fontSize: 46 }}>{total}</span><span className="mu">heads expected · {present} present now</span></div>
            <table className="tbl"><thead><tr><th>Age group</th><th style={{ textAlign: 'right' }}>Veg</th><th style={{ textAlign: 'right' }}>Non-veg</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {['adult', 'child', 'infant'].map((a) => <tr key={a}><td>{AGE_LABEL[a]}</td><td className="num" style={{ textAlign: 'right' }}>{g[a].veg}</td><td className="num" style={{ textAlign: 'right' }}>{g[a].nonveg}</td><td className="num" style={{ textAlign: 'right' }}><b>{tot(a)}</b></td></tr>)}
                <tr><td><b>Total</b></td><td className="num" style={{ textAlign: 'right' }}><b>{g.adult.veg + g.child.veg + g.infant.veg}</b></td><td className="num" style={{ textAlign: 'right' }}><b>{g.adult.nonveg + g.child.nonveg + g.infant.nonveg}</b></td><td className="num" style={{ textAlign: 'right' }}><b>{total}</b></td></tr>
              </tbody></table>
            <div><div className="lbl" style={{ marginBottom: 4 }}>Dietary notes</div>
              {notes.length ? notes.map(([n, c]) => <span key={n} className="chip pen" style={{ marginRight: 6, marginBottom: 6 }}>{n} × {c}</span>) : <span className="mu">None</span>}</div>
          </section>
        ))}
        {!data.length && <div className="card3 band" style={{ padding: 20 }}>No functions yet.</div>}
      </div>
    </>
  );
}
