'use client';
// "My tasks": open tasks I am on (and checklist items given to me), across events or for one event.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/components/client';
import { Label, Due, tasksApi } from './shared';

const IST = 5.5 * 3600e3;
const dayKey = (t) => new Date(t + IST).toISOString().slice(0, 10);

export default function MyTasks({ eventId = null, compact = false }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setD(await tasksApi('my', { eventId })); } catch (e) { if (!compact) toast(e.message, true); setD({ cards: [], labels: [] }); }
  }, [eventId, compact]);
  useEffect(() => { load(); }, [load]);

  const labels = useMemo(() => new Map((d?.labels || []).map((l) => [l.id, l])), [d]);
  const now = Date.now();
  const groups = useMemo(() => {
    const g = { over: [], today: [], soon: [], none: [] };
    for (const c of d?.cards || []) {
      const dates = [c.due, ...(c.mine || []).map((i) => i.due)].filter(Boolean).map((x) => new Date(x).getTime());
      const first = dates.length ? Math.min(...dates) : null;
      const key = first == null ? 'none' : first < now ? 'over' : dayKey(first) === dayKey(now) ? 'today' : 'soon';
      g[key].push({ ...c, first });
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => (a.first ?? 9e15) - (b.first ?? 9e15));
    return g;
  }, [d, now]);

  async function act(action, data, ok) {
    setBusy(true);
    try { await tasksApi(action, data); toast(ok); await load(); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  }

  const total = d?.cards.length || 0;
  const href = (c) => `/admin/e/${c.eventId}/tasks?t=${c.id}`;
  const Row = ({ c }) => (
    <div className="stack" style={{ gap: 4, padding: '9px 11px', borderRadius: 12, background: 'var(--well)' }}>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" disabled={busy} onChange={() => act('move', { id: c.id, status: 'done' }, 'Marked as done')} style={{ width: 22, height: 22, accentColor: '#2fd486', flex: 'none', marginTop: 2 }} aria-label={`Mark done: ${c.title}`} />
        <Link href={href(c)} style={{ flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
          <b style={{ overflowWrap: 'anywhere' }}>{c.title}</b>
          {!compact && !eventId && <span className="mu" style={{ fontSize: 12.5 }}> · {c.eventName}</span>}
          <div className="row" style={{ gap: 6, marginTop: 3 }}>
            {c.due && <Due iso={c.due} />}
            {c.status === 'doing' && <span className="chip pen">In progress</span>}
            {c.items[1] > 0 && <span className="mu" style={{ fontSize: 12.5 }}>Checklist {c.items[0]}/{c.items[1]}</span>}
          </div>
        </Link>
        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>{c.labels.slice(0, 2).map((l) => <Label key={l} l={labels.get(l)} />)}</span>
      </div>
      {(c.mine || []).map((i) => (
        <div key={i.id} className="row" style={{ flexWrap: 'nowrap', gap: 10, paddingLeft: 32 }}>
          <input type="checkbox" disabled={busy} onChange={() => act('item.toggle', { id: i.id, done: true }, 'Ticked')} style={{ width: 20, height: 20, accentColor: '#2fd486', flex: 'none' }} aria-label={`Tick: ${i.text}`} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{i.text} <span className="mu" style={{ fontSize: 12 }}>(your checklist item)</span></span>
          {i.due && <Due iso={i.due} style={{ fontSize: 12 }} />}
        </div>
      ))}
    </div>
  );
  const Section = ({ title, list }) => (list.length ? (
    <div className="stack" style={{ gap: 8 }}><div className="lbl">{title} · {list.length}</div>{list.map((c) => <Row key={c.id} c={c} />)}</div>
  ) : null);

  if (compact) {
    const list = [...groups.over, ...groups.today, ...groups.soon, ...groups.none];
    const chip = (k) => groups[k].length;
    return (
      <section className="card3 stack" style={{ padding: '18px 16px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="go" style={{ fontSize: 22 }}>My tasks</h2>
          <span className="row" style={{ gap: 6 }}>
            {chip('over') > 0 && <span className="chip dec">{chip('over')} overdue</span>}
            {chip('today') > 0 && <span className="chip pen">{chip('today')} today</span>}
            <span className="chip gray">{total} open</span>
          </span>
        </div>
        {!d ? <div className="skel" style={{ height: 60, borderRadius: 12 }} /> : !total ? <p className="mu" style={{ margin: 0 }}>No open tasks for you on this event.</p> : list.slice(0, 5).map((c) => <Row key={c.id} c={c} />)}
        {total > 5 && <span className="mu" style={{ fontSize: 13 }}>and {total - 5} more</span>}
        <Link href={`/admin/e/${eventId}/tasks`} style={{ fontWeight: 700 }}>Open the task board →</Link>
      </section>
    );
  }

  if (!d) return <div className="skel" style={{ height: 160, borderRadius: 18 }} />;
  return (
    <section className="card3 stack" style={{ padding: '18px 16px', maxWidth: 820 }}>
      {!total && <p className="mu" style={{ margin: 0 }}>You have no open tasks. Tasks you are added to, and checklist items given to you, appear here.</p>}
      <Section title="Overdue" list={groups.over} />
      <Section title="Due today" list={groups.today} />
      <Section title="Coming up" list={groups.soon} />
      <Section title="No due date" list={groups.none} />
    </section>
  );
}
