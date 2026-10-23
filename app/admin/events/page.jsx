import Link from 'next/link';
import DeleteEventButton from '@/components/DeleteEventButton';
import { pageUser, allowed } from '@/lib/page';
import { listEvents } from '@/lib/data';
import { db } from '@/lib/db';
import { fmtDate, fmtHrs } from '@/lib/util';
import Icon from '@/components/Icon';
import NoAccess from '@/components/NoAccess';
import EventForm from './EventForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events' };

export default async function Events() {
  const user = await pageUser();
  if (!allowed(user, 'events.manage', 'events.edit', 'dashboard.view')) return <NoAccess what="events" />;
  const events = await listEvents();
  const k = await db();
  const series = await k('series').orderBy('id', 'desc');
  const manage = allowed(user, 'events.manage');
  const canDelete = allowed(user, 'events.delete');
  const canEdit = allowed(user, 'events.edit', 'events.manage');
  return (
    <>
      <div className="top"><h1>Events &amp; series</h1></div>
      <div className="kpis">
        {events.map((e, i) => (
          <div key={e.id} className="stack" style={{ gap: 6 }}>
            <Link href={`/admin/e/${e.id}`} className="card3 band tilt3 kpi" style={{ animationDelay: `${i * 0.06}s` }}>
              <span className="lbl">{series.find((s) => s.id === e.series_id)?.name || 'Event'} · {e.status}</span>
              <span className="go" style={{ fontSize: 26 }}>{e.name}</span>
              <span className="mu">{e.first_at ? `Starts ${fmtDate(e.first_at)}` : e.starts_at ? `${fmtDate(e.starts_at)}, ${fmtHrs(e.starts_at)}` : 'No date set yet'} · {e.invitations} invited</span>
            </Link>
            {(canEdit || canDelete) && (
              <div className="row" style={{ gap: 8 }}>
                {canEdit && <Link href={`/admin/e/${e.id}/settings`} className="btn sm"><Icon n="edit" size={15} />Edit event</Link>}
                {canDelete && <DeleteEventButton id={e.id} name={e.name} />}
              </div>
            )}
          </div>
        ))}
        {!events.length && <div className="card3 band" style={{ padding: 20 }}><b>No events yet.</b><p className="mu" style={{ margin: '6px 0 0' }}>Create your first event below. You can add its functions (Barakhana, Dinner Night…) next.</p></div>}
      </div>
      {manage && <EventForm series={series.map((s) => ({ id: s.id, name: s.name }))} />}
    </>
  );
}
