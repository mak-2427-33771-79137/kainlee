import { pageUser, pageEvent, allowed } from '@/lib/page';
import { loadEventData, filterInvitations, roomsNeeded, computeStats } from '@/lib/stats';
import { db } from '@/lib/db';
import { can, canOn, ROLES } from '@/lib/rbac';
import { categoryLabel, prettyMobile, fmtDate, fmtHrs, fmtShort } from '@/lib/util';
import NoAccess from '@/components/NoAccess';
import GuestTable from './GuestTable';
import { AutoRefresh } from '@/components/Live';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Guests' };

const KEYS = ['status', 'category', 'offrs', 'guestroom', 'handler', 'fn', 'att', 'walkin', 'q'];

export default async function Guests({ params, searchParams }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  const sp = await searchParams;
  const f = Object.fromEntries(KEYS.map((x) => [x, sp[x] || '']).filter(([, v]) => v));
  const mine = f.handler === 'me';
  if (!allowed(user, 'guests.view') && !mine) return <NoAccess what="the guest list" />;
  const k = await db();
  const all = await loadEventData(ev.id);
  const invs = filterInvitations(all, f, user);
  const rooms = await k('rooms').where({ event_id: ev.id }).orderBy([{ column: 'sort' }, { column: 'name' }]);
  const taken = new Set(all.flatMap((i) => i.rooms.map((r) => r.id)));
  const handlers = (await k('users').where({ active: true }).whereIn('role', Object.keys(ROLES).filter((r) => ROLES[r].handler)).orderBy('name'))
    .map((u) => ({ id: u.id, name: u.name, role: ROLES[u.role].label }));
  const contacts = can(user.role, 'guests.contacts');
  const counts = {
    all: all.length,
    offrs: all.filter((i) => i.category === 'officer').length,
    gr: all.filter((i) => roomsNeeded(i)).length,
    grPending: all.filter((i) => roomsNeeded(i) > i.rooms.length).length,
    unsent: all.filter((i) => !i.invite_sent_at).length,
    pending: all.filter((i) => i.rsvp_status === 'pending').length,
    attending: all.filter((i) => i.rsvp_status === 'attending').length,
    declined: all.filter((i) => i.rsvp_status === 'declined').length,
    unassigned: all.filter((i) => !i.handler_id).length,
    mine: all.filter((i) => i.handler_id === user.id).length,
  };
  const fnCount = ev.functions.length;
  const rows = invs.map((inv) => {
    const need = roomsNeeded(inv);
    return {
      id: inv.id,
      name: [inv.rank, inv.name].filter(Boolean).join(' '),
      category: inv.category, cat: categoryLabel(inv.category),
      city: inv.city,
      mobile: contacts ? inv.mobile : null,
      mobilePretty: contacts ? prettyMobile(inv.mobile) : '',
      handler_id: inv.handler_id, handler: inv.handler_name,
      rsvp: inv.rsvp_status,
      family: inv.members.filter((m) => m.relation !== 'self').map((m) => m.relation === 'spouse' ? 'Wife/Husband' : m.relation).join(', '),
      persons: inv.members.length,
      heads: fnCount ? Math.max(0, ...ev.functions.map((fx) => inv.members.filter((m) => m.functions[fx.id]?.attending).length)) : 0,
      sent: inv.invite_sent_at ? fmtShort(inv.invite_sent_at) : null,
      eligible: !!inv.guestroom_eligible,
      need,
      eta: inv.guestroom_eta ? [fmtDate(inv.guestroom_eta), fmtHrs(inv.guestroom_eta)] : null,
      etd: inv.guestroom_etd ? [fmtDate(inv.guestroom_etd), fmtHrs(inv.guestroom_etd)] : null,
      rooms: inv.rooms,
      note: inv.guestroom_note || '',
      noteVisible: !!inv.guestroom_note_visible,
      canEdit: canOn(user, 'guests.edit', inv),
      canPin: canOn(user, 'pin.reset', inv),
      canSend: canOn(user, 'invites.send', inv),
      canTransfer: can(user.role, 'guests.assign') || (can(user.role, 'guests.transfer_own') && inv.handler_id === user.id),
      walkinPending: inv.members.some((m) => m.is_walkin && m.walkin_review === 'pending'),
    };
  });
  const stats = computeStats(all, ev.functions, rooms.length).guestroom;
  return (
    <>
      <AutoRefresh every={45} />
      <GuestTable
        event={{ id: ev.id, name: ev.name, guestroom: !!ev.guestroom_enabled }}
        rows={rows}
        filters={f}
        counts={counts}
        handlers={handlers}
        vacant={rooms.filter((r) => !taken.has(r.id)).map((r) => ({ id: r.id, name: r.name, location: r.location }))}
        roomStats={stats}
        me={{ id: user.id, name: user.name }}
        perms={{
          assign: can(user.role, 'guests.assign'),
          transferOwn: can(user.role, 'guests.transfer_own'),
          allot: can(user.role, 'rooms.manage'),
          exportAll: can(user.role, 'export.all'),
          exportOwn: can(user.role, 'export.own'),
          isHandler: !!ROLES[user.role]?.handler,
        }}
      />
    </>
  );
}
