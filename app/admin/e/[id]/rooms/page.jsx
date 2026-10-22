import { pageUser, pageEvent, allowed } from '@/lib/page';
import { db } from '@/lib/db';
import { loadEventData, computeStats, roomsNeeded } from '@/lib/stats';
import { can } from '@/lib/rbac';
import { prettyMobile, fmtDate, fmtHrs } from '@/lib/util';
import NoAccess from '@/components/NoAccess';
import Rooms from './Rooms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Guest rooms' };

export default async function RoomsPage({ params }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  if (!allowed(user, 'rooms.view')) return <NoAccess what="guest rooms" />;
  const k = await db();
  const rooms = await k('rooms').where({ event_id: ev.id }).orderBy([{ column: 'sort' }, { column: 'name' }]);
  const invs = await loadEventData(ev.id);
  const contacts = can(user.role, 'guests.contacts');
  const when = (d) => (d ? `${fmtDate(d)} ${fmtHrs(d)}` : '—');
  const byRoom = new Map();
  for (const inv of invs) for (const r of inv.rooms) byRoom.set(r.id, inv);
  const person = (inv) => ({ id: inv.id, name: [inv.rank, inv.name].filter(Boolean).join(' '), mobile: contacts ? inv.mobile : null, mobilePretty: contacts ? prettyMobile(inv.mobile) : '', eta: when(inv.guestroom_eta), etd: when(inv.guestroom_etd), handler: inv.handler_name, need: roomsNeeded(inv), got: inv.rooms.length, note: inv.guestroom_note || '' });
  const list = rooms.map((r) => ({ id: r.id, name: r.name, location: r.location || '', notes: r.notes || '', guest: byRoom.get(r.id) ? person(byRoom.get(r.id)) : null }));
  const waiting = invs.filter((inv) => roomsNeeded(inv) > inv.rooms.length).map(person);
  const s = computeStats(invs, ev.functions, rooms.length).guestroom;
  return <Rooms event={{ id: ev.id, name: ev.name }} rooms={list} waiting={waiting} s={s} manage={can(user.role, 'rooms.manage')} exportOk={can(user.role, 'export.all') || can(user.role, 'export.own')} />;
}
