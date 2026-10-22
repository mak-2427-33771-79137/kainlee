import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageUser, pageEvent, allowed } from '@/lib/page';
import { db } from '@/lib/db';
import { loadEventData, roomsNeeded } from '@/lib/stats';
import { can, canOn, ROLES } from '@/lib/rbac';
import { categoryLabel, prettyMobile, fmtDate, fmtHrs, fmtShort, dateToIstInput, siteUrl } from '@/lib/util';
import NoAccess from '@/components/NoAccess';
import GuestEditor from './GuestEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Guest' };

export default async function GuestDetail({ params }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  const { inv: invId } = await params;
  const all = await loadEventData(ev.id);
  const inv = all.find((x) => x.id === Number(invId));
  if (!inv) notFound();
  if (!allowed(user, 'guests.view') && inv.handler_id !== user.id) return <NoAccess what="this guest" />;
  const k = await db();
  const rooms = await k('rooms').where({ event_id: ev.id }).orderBy([{ column: 'sort' }, { column: 'name' }]);
  const taken = new Set(all.flatMap((i) => i.rooms.map((r) => r.id)));
  const handlers = (await k('users').where({ active: true }).whereIn('role', Object.keys(ROLES).filter((r) => ROLES[r].handler)).orderBy('name')).map((u) => ({ id: u.id, name: u.name, role: ROLES[u.role].label }));
  const history = await k('audit_log').where({ invitation_id: inv.id }).orderBy('id', 'desc').limit(40);
  const contacts = can(user.role, 'guests.contacts');
  const canEdit = canOn(user, 'guests.edit', inv);
  const r = {
    id: inv.id, name: [inv.rank, inv.name].filter(Boolean).join(' '), cat: categoryLabel(inv.category), city: inv.city,
    mobile: contacts ? inv.mobile : null, mobilePretty: contacts ? prettyMobile(inv.mobile) : '',
    handler_id: inv.handler_id, handler: inv.handler_name, handlerPhone: inv.handler_phone,
    rsvp: inv.rsvp_status, extra_cap: inv.extra_cap,
    sent: inv.invite_sent_at ? fmtShort(inv.invite_sent_at) : null, reminded: inv.reminder_sent_at ? fmtShort(inv.reminder_sent_at) : null,
    seen: inv.guest_last_seen_at ? fmtShort(inv.guest_last_seen_at) : null,
    pin: canOn(user, 'pin.reset', inv) ? inv.pin : null,
    link: canOn(user, 'invites.send', inv) ? `${siteUrl(null) || ''}/i/${inv.token}` : null,
    eligible: !!inv.guestroom_eligible, required: !!inv.guestroom_required, need: roomsNeeded(inv),
    rooms_required: inv.rooms_required || 1,
    eta: dateToIstInput(inv.guestroom_eta), etd: dateToIstInput(inv.guestroom_etd),
    etaTxt: inv.guestroom_eta ? [fmtDate(inv.guestroom_eta), fmtHrs(inv.guestroom_eta)] : null,
    etdTxt: inv.guestroom_etd ? [fmtDate(inv.guestroom_etd), fmtHrs(inv.guestroom_etd)] : null,
    rooms: inv.rooms, note: inv.guestroom_note || '', noteVisible: !!inv.guestroom_note_visible,
    canEdit, canPin: canOn(user, 'pin.reset', inv), canSend: canOn(user, 'invites.send', inv),
    canTransfer: can(user.role, 'guests.assign') || (can(user.role, 'guests.transfer_own') && inv.handler_id === user.id),
    canMark: canOn(user, 'checkin.mark', inv),
    canRemove: can(user.role, 'guests.edit'),
    members: inv.members.map((m) => ({
      id: m.id, name: m.name, relation: m.relation, age_group: m.age_group, meal: m.meal, meal_note: m.meal_note || '',
      is_walkin: !!m.is_walkin, walkin_review: m.walkin_review,
      attending: Object.entries(m.functions).filter(([, v]) => v.attending).map(([f]) => Number(f)),
      attendance: Object.fromEntries(Object.entries(m.functions).map(([f, v]) => [f, v.attendance || null])),
    })),
  };
  return (
    <>
      <div className="top">
        <div style={{ flex: 1, minWidth: 220 }}>
          <Link href={`/admin/e/${ev.id}/guests`} className="mu" style={{ fontSize: 13 }}>← Guests</Link>
          <h1>{r.name}</h1>
          <div className="mu" style={{ fontSize: 14 }}>{r.cat}{r.city ? ` · ${r.city}` : ''} · Invite {r.sent ? `sent ${r.sent}` : 'not sent'}{r.reminded ? ` · Reminder ${r.reminded}` : ''}{r.seen ? ` · Opened their page ${r.seen}` : ''}</div>
        </div>
      </div>
      <GuestEditor
        event={{ id: ev.id, functions: ev.functions.map((f) => ({ id: f.id, name: f.name, when: `${fmtDate(f.starts_at)}, ${fmtHrs(f.starts_at)}` })) }}
        r={r}
        handlers={handlers}
        vacant={rooms.filter((x) => !taken.has(x.id)).map((x) => ({ id: x.id, name: x.name, location: x.location }))}
        canAllot={can(user.role, 'rooms.manage')}
        canReview={can(user.role, 'walkins.review')}
        assignAll={can(user.role, 'guests.assign')}
        me={user.id}
        history={history.map((h) => ({ id: h.id, at: fmtShort(h.at), actor: h.actor, action: h.action, details: h.details }))}
      />
    </>
  );
}
