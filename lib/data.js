import { db } from './db';
import {
  newToken, newPin, newCheckinCode, cleanName, isLatinName, RELATIONS, AGE_GROUPS, FAMILY_RELATIONS,
  istInputToDate,
} from './util';

// Admin edit of the guest room allotment comment (editable any time).
export async function saveGuestroomNote(invId, { note, visible }, user) {
  const k = await db();
  const clean = String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  await k('invitations').where({ id: invId }).update({
    guestroom_note: clean,
    guestroom_note_visible: visible !== false,
    guestroom_note_by: user.id,
    guestroom_note_at: new Date(),
  });
  return clean;
}
import { bad } from './api';

export async function getEvent(id) {
  const k = await db();
  const ev = await k('events').where({ id: Number(id) }).first();
  if (!ev) return null;
  ev.functions = await k('functions').where({ event_id: ev.id }).orderBy([{ column: 'starts_at' }, { column: 'sort' }, { column: 'id' }]);
  return ev;
}

export async function listEvents() {
  const k = await db();
  const [evs, fns, cnt] = await Promise.all([
    k('events').orderBy('id', 'desc'),
    k('functions').select('event_id').min({ first: 'starts_at' }).groupBy('event_id'),
    k('invitations').select('event_id').count({ n: '*' }).groupBy('event_id'),
  ]);
  const fm = Object.fromEntries(fns.map((r) => [r.event_id, r.first]));
  const cm = Object.fromEntries(cnt.map((r) => [r.event_id, Number(r.n)]));
  return evs.map((e) => ({ ...e, first_at: fm[e.id] || null, invitations: cm[e.id] || 0 }));
}

// Create (or return) the invitation for an invitee at an event, with a "self" member.
export async function ensureInvitation(trx, event, invitee, extraCap) {
  const existing = await trx('invitations').where({ event_id: event.id, invitee_id: invitee.id }).first();
  if (existing) return { invitation: existing, created: false };
  let token, code;
  for (let i = 0; i < 5; i++) {
    token = newToken(); code = newCheckinCode();
    const clash = await trx('invitations').where({ token }).orWhere({ checkin_code: code }).first();
    if (!clash) break;
  }
  const [id] = await trx('invitations').insert({
    event_id: event.id, invitee_id: invitee.id, token, pin: newPin(), checkin_code: code,
    extra_cap: extraCap ?? event.default_extra_cap ?? 2,
    guestroom_eligible: invitee.category === 'officer',
    created_at: new Date(),
  });
  await trx('members').insert({
    invitation_id: id, name: displayName(invitee), relation: 'self', age_group: 'adult', meal: 'veg', sort: 0,
  });
  return { invitation: await trx('invitations').where({ id }).first(), created: true };
}

export function displayName(inv) {
  return [inv.rank, inv.name].filter(Boolean).join(' ').trim();
}

// Full invitation with invitee, members and per-function marks.
export async function loadInvitation(where) {
  const k = await db();
  const inv = await k('invitations').where(where).first();
  if (!inv) return null;
  inv.invitee = await k('invitees').where({ id: inv.invitee_id }).first();
  const members = await k('members').where({ invitation_id: inv.id }).orderBy([{ column: 'sort' }, { column: 'id' }]);
  const ids = members.map((m) => m.id);
  const marks = ids.length ? await k('member_functions').whereIn('member_id', ids) : [];
  for (const m of members) {
    m.functions = {};
    for (const mf of marks.filter((x) => x.member_id === m.id)) {
      m.functions[mf.function_id] = { attending: !!mf.attending, attendance: mf.attendance, marked_at: mf.marked_at };
    }
  }
  inv.members = members;
  return inv;
}

/**
 * Save the family list and per-function RSVP.
 * payload: { decline?: bool, members: [{id?, name, relation, age_group, meal, meal_note, attending:[fnId]}] }
 * byAdmin: admins may edit the self member's name and exceed the extras cap.
 */
export async function saveRsvp(invId, event, payload, { byAdmin = false } = {}) {
  const fnIds = new Set(event.functions.map((f) => f.id));
  const incoming = Array.isArray(payload.members) ? payload.members.slice(0, 25) : [];
  const decline = !!payload.decline;

  const k = await db();
  return k.transaction(async (trx) => {
    const inv = await trx('invitations').where({ id: invId }).forUpdate().first();
    const current = await trx('members').where({ invitation_id: invId });
    const byId = new Map(current.map((m) => [m.id, m]));
    const self = current.find((m) => m.relation === 'self');

    const cleaned = [];
    for (const [i, m] of incoming.entries()) {
      const existing = m.id ? byId.get(Number(m.id)) : null;
      if (m.id && !existing) bad('Family list is out of date. Please reload the page.');
      const isSelf = existing?.relation === 'self';
      const relation = isSelf ? 'self' : RELATIONS.includes(m.relation) && m.relation !== 'self' ? m.relation : 'other';
      let name = cleanName(isSelf && !byAdmin ? existing.name : m.name);
      if (!name) bad('Please enter a name for every person.');
      if (!isLatinName(name)) bad(`"${name}": please type names in English letters.`);
      if (existing?.is_walkin && !byAdmin) continue;
      cleaned.push({
        id: existing?.id,
        name,
        relation,
        age_group: AGE_GROUPS.includes(m.age_group) ? m.age_group : 'adult',
        meal: m.meal === 'nonveg' ? 'nonveg' : 'veg',
        meal_note: cleanName(m.meal_note).slice(0, 200) || null,
        attending: decline ? [] : (Array.isArray(m.attending) ? m.attending.map(Number).filter((x) => fnIds.has(x)) : []),
        sort: isSelf ? 0 : i + 1,
      });
    }
    // self must always remain
    if (!cleaned.some((m) => m.relation === 'self') && self) {
      cleaned.unshift({ ...self, attending: [], id: self.id });
    }
    const extras = cleaned.filter((m) => !FAMILY_RELATIONS.includes(m.relation) && !byId.get(m.id)?.is_walkin).length;
    if (!byAdmin && extras > inv.extra_cap) bad(`Only ${inv.extra_cap} extra guest(s) are allowed besides your wife/husband and children.`);

    // delete removed (guests cannot delete walk-ins)
    const keep = new Set(cleaned.filter((m) => m.id).map((m) => m.id));
    const toDelete = current.filter((m) => !keep.has(m.id) && m.relation !== 'self' && (byAdmin || !m.is_walkin)).map((m) => m.id);
    if (toDelete.length) await trx('members').whereIn('id', toDelete).del();

    let anyAttending = false;
    for (const m of cleaned) {
      const row = { name: m.name, relation: m.relation, age_group: m.age_group, meal: m.meal, meal_note: m.meal_note, sort: m.sort };
      let id = m.id;
      if (id) await trx('members').where({ id }).update(row);
      else [id] = await trx('members').insert({ ...row, invitation_id: invId });
      for (const fid of fnIds) {
        const att = m.attending.includes(fid);
        if (att) anyAttending = true;
        await trx('member_functions')
          .insert({ member_id: id, function_id: fid, attending: att })
          .onConflict(['member_id', 'function_id'])
          .merge({ attending: att });
      }
    }
    const status = anyAttending ? 'attending' : 'declined';
    const upd = { rsvp_status: status, responded_at: new Date() };

    // Guest room: only for eligible invitations, and only while attending
    if ((inv.guestroom_eligible || byAdmin) && event.guestroom_enabled !== 0 && event.guestroom_enabled !== false) {
      const gr = payload.guestroom || {};
      if (status !== 'attending' || !gr.required) {
        Object.assign(upd, { guestroom_required: false, guestroom_eta: null, guestroom_etd: null });
        await trx('room_allotments').where({ invitation_id: invId }).del();
      } else {
        const maxRooms = byAdmin ? 10 : 4;
        const rooms = Math.round(Number(gr.rooms) || 1);
        if (rooms < 1 || rooms > maxRooms) bad(`Number of guest rooms must be between 1 and ${maxRooms}.`);
        upd.rooms_required = rooms;
        const eta = istInputToDate(gr.eta);
        const etd = istInputToDate(gr.etd);
        if (!eta || !etd) bad('Please enter both arrival (ETA) and departure (ETD) for the guest room.');
        if (etd <= eta) bad('Departure (ETD) must be after arrival (ETA).');
        if (etd - eta > 15 * 86400000) bad('Guest room stay cannot be longer than 15 days. Please contact the organisers.');
        Object.assign(upd, { guestroom_required: true, guestroom_eta: eta, guestroom_etd: etd });
      }
    }
    await trx('invitations').where({ id: invId }).update(upd);
    return { status, count: cleaned.length };
  });
}
