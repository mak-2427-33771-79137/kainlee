// Loads a whole event into memory (fine for a few thousand guests) and
// computes the dashboard numbers and filtered lists from one consistent snapshot.
import { db } from './db';
import { CATEGORIES } from './util';

export async function loadEventData(eventId) {
  const k = await db();
  const invs = await k('invitations as i')
    .join('invitees as p', 'p.id', 'i.invitee_id')
    .leftJoin('users as h', 'h.id', 'i.handler_id')
    .where('i.event_id', eventId)
    .select('i.*', 'p.category', 'p.rank', 'p.name', 'p.mobile', 'p.city', 'p.lang', 'p.notes',
      'h.name as handler_name', 'h.phone as handler_phone')
    .orderBy([{ column: 'p.category' }, { column: 'p.name' }]);
  const ids = invs.map((x) => x.id);
  const members = ids.length
    ? await k('members').whereIn('invitation_id', ids).orderBy([{ column: 'sort' }, { column: 'id' }])
    : [];
  const mids = members.map((m) => m.id);
  const marks = [];
  for (let i = 0; i < mids.length; i += 2000) {
    marks.push(...(await k('member_functions').whereIn('member_id', mids.slice(i, i + 2000))));
  }
  const rooms = await k('room_allotments as a').join('rooms as r', 'r.id', 'a.room_id')
    .where('r.event_id', eventId).select('a.invitation_id', 'r.id', 'r.name', 'r.location');
  const roomBy = new Map();
  for (const r of rooms) {
    if (!roomBy.has(r.invitation_id)) roomBy.set(r.invitation_id, []);
    roomBy.get(r.invitation_id).push({ id: r.id, name: r.name, location: r.location });
  }
  const markBy = new Map();
  for (const mf of marks) {
    if (!markBy.has(mf.member_id)) markBy.set(mf.member_id, {});
    markBy.get(mf.member_id)[mf.function_id] = { attending: !!mf.attending, attendance: mf.attendance, marked_at: mf.marked_at, marked_by: mf.marked_by };
  }
  const memBy = new Map();
  for (const m of members) {
    m.functions = markBy.get(m.id) || {};
    if (!memBy.has(m.invitation_id)) memBy.set(m.invitation_id, []);
    memBy.get(m.invitation_id).push(m);
  }
  for (const inv of invs) {
    inv.members = memBy.get(inv.id) || [];
    inv.rooms = roomBy.get(inv.id) || [];
  }
  return invs;
}

const blankHeads = () => ({ adult: 0, child: 0, infant: 0, total: 0, veg: 0, nonveg: 0 });
function addHead(h, m) { h[m.age_group] = (h[m.age_group] || 0) + 1; h.total++; h[m.meal]++; }

export function roomsNeeded(inv) {
  return inv.guestroom_required && inv.rsvp_status === 'attending' ? Math.max(1, inv.rooms_required || 1) : 0;
}

export function computeStats(invs, functions, totalRooms = 0) {
  const s = {
    invitation: { total: invs.length, sent: 0, unsent: 0, responded: 0, pending: 0, attending: 0, declined: 0, qr_viewed: 0, reminded: 0 },
    categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, { invited: 0, attending: 0, declined: 0, pending: 0, heads: 0 }])),
    functions: {},
    walkins_pending: 0,
    guestroom: { officers: 0, families: 0, rooms_needed: 0, rooms_allotted: 0, still_needed: 0, pending_families: 0, total_rooms: totalRooms, vacant: 0 },
    unassigned: 0,
  };
  for (const f of functions) {
    s.functions[f.id] = { families: 0, heads: blankHeads(), notes: [], present: 0, absent: 0, notyet: 0, walkins: 0, present_families: 0 };
  }
  for (const inv of invs) {
    const I = s.invitation;
    if (inv.invite_sent_at) I.sent++; else I.unsent++;
    if (inv.rsvp_status === 'pending') I.pending++; else I.responded++;
    if (inv.rsvp_status === 'attending') I.attending++;
    if (inv.rsvp_status === 'declined') I.declined++;
    if (inv.qr_viewed_at) I.qr_viewed++;
    if (inv.reminder_sent_at) I.reminded++;
    if (!inv.handler_id) s.unassigned++;
    if (inv.category === 'officer') s.guestroom.officers++;
    const need = roomsNeeded(inv);
    if (need) {
      s.guestroom.families++;
      s.guestroom.rooms_needed += need;
      s.guestroom.rooms_allotted += Math.min(need, inv.rooms.length);
      if (inv.rooms.length < need) s.guestroom.pending_families++;
    }
    const c = s.categories[inv.category];
    if (c) { c.invited++; c[inv.rsvp_status]++; }
    const catHeads = new Set();
    for (const f of functions) {
      const F = s.functions[f.id];
      let fam = false, famPresent = false;
      for (const m of inv.members) {
        const mf = m.functions[f.id];
        if (mf?.attending && !m.is_walkin) {
          fam = true; addHead(F.heads, m); catHeads.add(m.id);
          if (m.meal_note) F.notes.push({ name: m.name, note: m.meal_note });
          if (mf.attendance === 'present') F.present++;
          else if (mf.attendance === 'absent') F.absent++;
          else F.notyet++;
        } else if (mf?.attendance === 'present') {
          F.present++; F.walkins++;
        }
        if (mf?.attendance === 'present') famPresent = true;
      }
      if (fam) F.families++;
      if (famPresent) F.present_families++;
    }
    if (c) c.heads += catHeads.size;
    for (const m of inv.members) if (m.is_walkin && m.walkin_review === 'pending') s.walkins_pending++;
  }
  const allottedRooms = invs.reduce((a, inv) => a + inv.rooms.length, 0);
  s.guestroom.vacant = Math.max(0, totalRooms - allottedRooms);
  s.guestroom.still_needed = Math.max(0, s.guestroom.rooms_needed - s.guestroom.rooms_allotted);
  return s;
}

/**
 * Filter invitations for the details list. f keys:
 *  status, category, offrs, guestroom (required|pending|allotted), handler (id|me|none), fn + att, walkin, q
 */
export function filterInvitations(invs, f = {}, me = null) {
  const q = (f.q || '').trim().toLowerCase();
  const fn = f.fn ? Number(f.fn) : null;
  return invs.filter((inv) => {
    switch (f.status) {
      case 'sent': if (!inv.invite_sent_at) return false; break;
      case 'unsent': if (inv.invite_sent_at) return false; break;
      case 'responded': if (inv.rsvp_status === 'pending') return false; break;
      case 'pending': case 'attending': case 'declined': if (inv.rsvp_status !== f.status) return false; break;
      case 'qr_viewed': if (!inv.qr_viewed_at) return false; break;
      case 'qr_not_viewed': if (inv.qr_viewed_at || inv.rsvp_status !== 'attending') return false; break;
      case 'reminded': if (!inv.reminder_sent_at) return false; break;
      case 'not_reminded': if (inv.reminder_sent_at || inv.rsvp_status === 'declined') return false; break;
      default:
    }
    if (f.category && inv.category !== f.category) return false;
    if (f.offrs === '1' && inv.category !== 'officer') return false;
    const need = roomsNeeded(inv);
    if (f.guestroom === 'required' && !need) return false;
    if (f.guestroom === 'pending' && !(need && inv.rooms.length < need)) return false;
    if (f.guestroom === 'allotted' && !(need && inv.rooms.length >= need)) return false;
    if (f.handler) {
      if (f.handler === 'none') { if (inv.handler_id) return false; }
      else {
        const hid = f.handler === 'me' ? me?.id : Number(f.handler);
        if (inv.handler_id !== hid) return false;
      }
    }
    if (f.walkin === '1' && !inv.members.some((m) => m.is_walkin)) return false;
    if (f.walkin === 'pending' && !inv.members.some((m) => m.is_walkin && m.walkin_review === 'pending')) return false;
    if (fn) {
      const ms = inv.members;
      const exp = (m) => m.functions[fn]?.attending && !m.is_walkin;
      const att = (m) => m.functions[fn]?.attendance;
      let ok;
      switch (f.att) {
        case 'present': ok = ms.some((m) => att(m) === 'present'); break;
        case 'absent': ok = ms.some((m) => exp(m) && att(m) === 'absent'); break;
        case 'notyet': ok = ms.some((m) => exp(m) && !att(m)); break;
        case 'walkin': ok = ms.some((m) => att(m) === 'present' && !exp(m)); break;
        default: ok = ms.some(exp);
      }
      if (!ok) return false;
    }
    if (q) {
      const hay = [inv.rank, inv.name, inv.city, inv.mobile, inv.handler_name, ...inv.members.map((m) => m.name), ...inv.rooms.map((r) => r.name)].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export const STATUS_LABEL = {
  sent: 'Invites sent', unsent: 'Invites not sent', responded: 'Responded', pending: 'Not yet responded',
  attending: 'Attending', declined: 'Declined', qr_viewed: 'Opened their QR', qr_not_viewed: 'Attending but QR not opened',
  reminded: 'Reminder sent', not_reminded: 'Reminder not sent',
};
export const ATT_LABEL = { expected: 'Expected', present: 'Present', absent: 'Absent', notyet: 'Not yet arrived', walkin: 'Walk-ins / unregistered present' };
