import Link from 'next/link';
import { pageUser, pageEvent, allowed } from '@/lib/page';
import { loadEventData, computeStats } from '@/lib/stats';
import { db } from '@/lib/db';
import { CATEGORIES, fmtDate, fmtHrs, fmtDateHrs } from '@/lib/util';
import { can } from '@/lib/rbac';
import NoAccess from '@/components/NoAccess';
import March from '@/components/March';
import ExportMenu from '@/components/ExportMenu';
import { AutoRefresh, Count } from '@/components/Live';
import { computeInsights } from '@/lib/insights';
import Insights from './Insights';
import MyTasks from '@/components/tasks/MyTasks';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const pct = (a, b) => `${b ? Math.round((a / b) * 100) : 0}%`;

export default async function Dashboard({ params, searchParams }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  if (!allowed(user, 'dashboard.view')) return <NoAccess what="the dashboard" />;
  const sp = await searchParams;
  const fn = ev.functions.find((f) => f.id === Number(sp.fn)) || ev.functions[0];
  const k = await db();
  const rooms = await k('rooms').where({ event_id: ev.id }).count({ n: '*' }).first();
  const invs = await loadEventData(ev.id);
  const s = computeStats(invs, ev.functions, Number(rooms.n));
  const F = fn ? s.functions[fn.id] : null;
  const I = s.invitation;
  const G = s.guestroom;
  const g = (q) => `/admin/e/${ev.id}/guests?${new URLSearchParams(q)}`;
  const maxCat = Math.max(1, ...CATEGORIES.map((c) => s.categories[c.id].invited));
  const canExport = can(user.role, 'export.all');
  const x = computeInsights(invs, ev, { totalRooms: Number(rooms.n), fnId: sp.phase === 'day' && sp.fn ? Number(sp.fn) : null });
  const phase = ['before', 'day', 'after'].includes(sp.phase) ? sp.phase : x.phase;

  return (
    <>
      <AutoRefresh every={30} />
      <div className="top">
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="lbl">{ev.status === 'active' ? 'Event' : `Event · ${ev.status}`}</div>
          <h1>{ev.name}</h1>
          <div className="mu" style={{ fontSize: 14 }}>
            {ev.functions.map((f) => `${f.name} · ${fmtDate(f.starts_at)}, ${fmtHrs(f.starts_at)}`).join('  |  ') || (ev.starts_at ? `${fmtDate(ev.starts_at)}, ${fmtHrs(ev.starts_at)}` : 'No date set yet')}
            {ev.rsvp_deadline ? `  |  RSVP closes ${fmtDateHrs(ev.rsvp_deadline)}` : ''}
          </div>
        </div>
        {canExport && <ExportMenu eventId={ev.id} reports={[['summary', 'Summary report'], ['guests', 'Full guest list'], ['attendance', 'Attendance'], ['catering', 'Catering sheet'], ['rooms', 'Guest rooms']]} />}
        {can(user.role, 'invitees.manage') && <Link className="btn pri" href="/admin/directory">+ Add invitees</Link>}
      </div>
      <March squads={3} men={3} height={44} duration={26} />

      {!ev.functions.length && can(user.role, 'events.manage') && (
        <div className="card3 band" style={{ padding: 18 }}><b>Next step:</b> add the functions for this event (e.g. Barakhana, Ladies’ Dinner Night). <Link href={`/admin/e/${ev.id}/settings`}>Open event setup →</Link></div>
      )}

      <div className="kpis">
        <Link className="card3 band tilt3 kpi" href={g({})} style={{ animationDelay: '.05s' }}>
          <span className="lbl">Invitations</span>
          <span className="big"><Count to={I.total} /></span>
          <span>Sent <b>{I.sent}</b> · Not sent <b style={{ color: 'var(--red-text)' }}>{I.unsent}</b></span>
          <div className="bar"><i style={{ width: pct(I.sent, I.total) }} /></div>
          <span>Responded <b>{I.responded}</b> · Pending <b>{I.pending}</b></span>
          <div className="bar"><i className="r" style={{ width: pct(I.responded, I.total) }} /></div>
        </Link>

        <div className="card3 band tilt3 kpi" style={{ animationDelay: '.15s' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="lbl">Headcount</span>
            <span className="row" style={{ gap: 4 }}>
              {ev.functions.map((f) => <Link key={f.id} href={`?fn=${f.id}`} className={`fchip${fn?.id === f.id ? ' on' : ''}`} style={{ padding: '2px 8px', fontSize: 12 }}>{f.name}</Link>)}
            </span>
          </div>
          {F ? (<>
            <Link href={g({ fn: fn.id })} className="big" style={{ color: 'inherit', textDecoration: 'none' }}><Count to={F.heads.total} /></Link>
            <span>Adults <b>{F.heads.adult}</b> · 5–12 <b>{F.heads.child}</b> · Under 5 <b>{F.heads.infant}</b></span>
            <span>Veg <b>{F.heads.veg}</b> · Non-veg <b>{F.heads.nonveg}</b></span>
            <span className="mu" style={{ fontSize: 13 }}>{F.families} families · <Link href={g({ status: 'declined' })}>{I.declined} regret</Link></span>
          </>) : <span className="mu">Add a function to see headcounts.</span>}
        </div>

        <div className="card3 band tilt3 kpi" style={{ animationDelay: '.25s' }}>
          <span className="lbl">By category</span>
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={g({ category: c.id })} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'inherit', textDecoration: 'none' }}>
              <span>{c.short}</span><div className="bar"><i style={{ width: pct(s.categories[c.id].invited, maxCat) }} /></div><b style={{ textAlign: 'right' }}>{s.categories[c.id].invited}</b>
            </Link>
          ))}
        </div>

        {F && (
          <Link className="card3 band tilt3 kpi" href={g({ fn: fn.id, att: 'present' })} style={{ animationDelay: '.35s' }}>
            <span className="lbl">Attendance · {fn.name}</span>
            <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="big" style={{ color: 'var(--red)' }}><Count to={F.present} /></span><span className="mu">/ {F.heads.total} present</span></div>
            <div className="bar" style={{ height: 16 }}><i className="r" style={{ width: pct(F.present, F.heads.total || 1) }} /></div>
            <span>Not yet <b>{F.notyet}</b> · Absent <b>{F.absent}</b> · Walk-ins <b>{F.walkins}</b>{s.walkins_pending ? <b style={{ color: 'var(--red-text)' }}> ({s.walkins_pending} to review)</b> : null}</span>
          </Link>
        )}

        {!!ev.guestroom_enabled && (
          <Link className="card3 band tilt3 kpi" href={`/admin/e/${ev.id}/rooms`} style={{ animationDelay: '.45s' }}>
            <span className="lbl">Guest rooms</span>
            <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="big"><Count to={G.rooms_needed} /></span><span className="mu">required</span></div>
            <span>Allotted <b>{G.rooms_allotted}</b> · Vacant <b>{G.vacant}</b> of {G.total_rooms}</span>
            <div className="bar"><i style={{ width: pct(G.rooms_allotted, G.rooms_needed || 1) }} /></div>
            <span style={{ color: G.still_needed ? 'var(--red-text)' : 'var(--accent)', fontWeight: 700 }}>{G.still_needed ? `${G.still_needed} more room(s) needed` : 'All requests allotted'}</span>
          </Link>
        )}

      </div>

      <div style={{ margin: '18px 0' }}><MyTasks eventId={ev.id} compact /></div>

      <Insights x={x} s={s} ev={ev} phase={phase} sp={sp} canExport={canExport} canSend={can(user.role, 'invites.send')} />
    </>
  );
}
