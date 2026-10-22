import { pageUser, allowed } from '@/lib/page';
import { db } from '@/lib/db';
import { listEvents } from '@/lib/data';
import { prettyMobile } from '@/lib/util';
import NoAccess from '@/components/NoAccess';
import Directory from './Directory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitee directory' };

export default async function DirectoryPage() {
  const user = await pageUser();
  if (!allowed(user, 'invitees.manage')) return <NoAccess what="the invitee directory" />;
  const k = await db();
  const people = await k('invitees').orderBy([{ column: 'category' }, { column: 'name' }]);
  const links = await k('invitations').select('invitee_id', 'event_id');
  const by = new Map();
  for (const l of links) { if (!by.has(l.invitee_id)) by.set(l.invitee_id, []); by.get(l.invitee_id).push(l.event_id); }
  const events = (await listEvents()).map((e) => ({ id: e.id, name: e.name }));
  return (
    <Directory
      people={people.map((p) => ({ id: p.id, category: p.category, rank: p.rank || '', name: p.name, mobile: p.mobile || '', mobilePretty: prettyMobile(p.mobile), city: p.city || '', lang: p.lang, notes: p.notes || '', events: by.get(p.id) || [] }))}
      events={events}
    />
  );
}
