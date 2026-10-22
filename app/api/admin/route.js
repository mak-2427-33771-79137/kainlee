import bcrypt from 'bcryptjs';
import { handler, body, bad, audit } from '@/lib/api';
import { db } from '@/lib/db';
import { getAdmin, HttpError } from '@/lib/auth';
import { can, canOn, ROLES, ROLE_IDS } from '@/lib/rbac';
import { getEvent, loadInvitation, saveRsvp, ensureInvitation, displayName, saveGuestroomNote } from '@/lib/data';
import {
  CATEGORY_IDS, cleanName, isLatinName, normalizeMobile, istInputToDate, newPin, newToken, newCheckinCode,
  RELATIONS, AGE_GROUPS, siteUrl, fmtShort,
} from '@/lib/util';
import { setSetting } from '@/lib/settings';
import { buildMessage } from '@/lib/messages';
import { cardHtmlFor } from '@/lib/guest';
import { sanitizeCard } from '@/lib/cards';
import { saveSubscription, vapidPublicKey, notifyUsers, notifyGuestChange } from '@/lib/notify';
import { regimentName } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const int = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const str = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);

async function needInv(user, id, perm) {
  const k = await db();
  const inv = await k('invitations').where({ id: int(id) || 0 }).first();
  if (!inv) bad('Guest not found.', 404);
  if (perm && !canOn(user, perm, inv)) bad('You can only do this for guests you look after.', 403);
  return inv;
}
async function needEvent(id) {
  const ev = await getEvent(int(id) || 0);
  if (!ev) bad('Event not found.', 404);
  return ev;
}
async function invName(invId) {
  const k = await db();
  const r = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.id', invId).select('p.rank', 'p.name').first();
  return r ? displayName(r) : `#${invId}`;
}

const A = {};

// ---------- account & notifications (any logged-in user) ----------
A['account.password'] = async (u, b, req) => {
  const k = await db();
  const row = await k('users').where({ id: u.id }).first();
  if (!(await bcrypt.compare(String(b.current || ''), row.password_hash))) bad('Current password is wrong.');
  if (String(b.password || '').length < 8) bad('New password must be at least 8 characters.');
  await k('users').where({ id: u.id }).update({ password_hash: await bcrypt.hash(b.password, 11), session_version: row.session_version + 1 });
  await audit({ user: u, action: 'account.password', req });
  return { ok: true, relogin: true };
};
A['account.notify'] = async (u, b, req) => {
  const k = await db();
  await k('users').where({ id: u.id }).update({ notify_all: !!b.notify_all, phone: normalizeMobile(b.phone) });
  await audit({ user: u, action: 'account.update', details: `notify_all=${!!b.notify_all}`, req });
  return { ok: true };
};
A['push.key'] = async () => ({ key: await vapidPublicKey() });
A['push.subscribe'] = async (u, b, req) => {
  await saveSubscription(u, b.subscription, req.headers.get('user-agent'));
  return { ok: true };
};
A['notif.count'] = async (u) => {
  const { unreadCount } = await import('@/lib/notify');
  return { n: await unreadCount(u.id) };
};
A['notif.read'] = async (u, b) => {
  const k = await db();
  const q = k('notifications').where({ user_id: u.id }).whereNull('read_at');
  if (b.id) q.andWhere({ id: b.id });
  await q.update({ read_at: new Date() });
  return { ok: true };
};

// ---------- series & events ----------
A['series.save'] = async (u, b, req) => {
  if (!can(u.role, 'events.manage')) bad('Not allowed', 403);
  const k = await db();
  const name = str(b.name, 160);
  if (!name) bad('Give the series a name.');
  let id = int(b.id);
  if (id) await k('series').where({ id }).update({ name });
  else [id] = await k('series').insert({ name, created_at: new Date() });
  await audit({ user: u, action: 'series.save', details: name, req });
  return { id };
};

A['event.save'] = async (u, b, req) => {
  if (!can(u.role, 'events.manage')) bad('Not allowed', 403);
  const k = await db();
  const name = str(b.name, 160);
  if (!name) bad('Event name is required.');
  const row = {
    name,
    series_id: int(b.series_id),
    status: ['draft', 'active', 'closed'].includes(b.status) ? b.status : 'active',
    venue: str(b.venue), map_url: str(b.map_url, 500),
    rsvp_deadline: istInputToDate(b.rsvp_deadline),
    default_extra_cap: Math.max(0, Math.min(10, Number(b.default_extra_cap ?? 2) || 0)),
    card_host: str(b.card_host), card_unit: str(b.card_unit), card_note: str(b.card_note),
  };
  if (b.guestroom_enabled != null) row.guestroom_enabled = !!b.guestroom_enabled;
  if (row.map_url && !/^https?:\/\//i.test(row.map_url)) bad('Directions link must start with https://');
  let id = int(b.id);
  if (id) await k('events').where({ id }).update(row);
  else [id] = await k('events').insert({ ...row, card_unit: row.card_unit || (await regimentName()), created_at: new Date() });
  await audit({ user: u, eventId: id, action: b.id ? 'event.update' : 'event.create', details: name, req });
  return { id };
};

A['event.delete'] = async (u, b, req) => {
  if (!can(u.role, 'events.delete')) bad('Only the Super Admin can delete events.', 403);
  const ev = await needEvent(b.id);
  if (String(b.confirm || '').trim() !== ev.name) bad('Type the event name exactly to confirm.');
  const k = await db();
  await k('events').where({ id: ev.id }).del();
  await audit({ user: u, action: 'event.delete', details: ev.name, req });
  return { ok: true };
};

A['function.save'] = async (u, b, req) => {
  if (!can(u.role, 'events.manage')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const name = str(b.name, 160);
  const at = istInputToDate(b.starts_at);
  if (!name || !at) bad('Function name and date/time are required.');
  const map = str(b.map_url, 500);
  if (map && !/^https?:\/\//i.test(map)) bad('Directions link must start with https://');
  const row = { event_id: ev.id, name, starts_at: at, venue: str(b.venue), map_url: map, dress: str(b.dress, 120) };
  const k = await db();
  let id = int(b.id);
  if (id) await k('functions').where({ id, event_id: ev.id }).update(row);
  else [id] = await k('functions').insert(row);
  await audit({ user: u, eventId: ev.id, action: 'function.save', details: `${name} ${fmtShort(at)}`, req });
  return { id };
};
A['function.delete'] = async (u, b, req) => {
  if (!can(u.role, 'events.manage')) bad('Not allowed', 403);
  const k = await db();
  const f = await k('functions').where({ id: int(b.id) || 0 }).first();
  if (!f) bad('Not found', 404);
  await k('functions').where({ id: f.id }).del();
  await audit({ user: u, eventId: f.event_id, action: 'function.delete', details: f.name, req });
  return { ok: true };
};

A['templates.save'] = async (u, b, req) => {
  if (!can(u.role, 'events.manage')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const t = {};
  for (const key of ['invite_en', 'invite_hi', 'invite_ne', 'reminder_en', 'reminder_hi', 'reminder_ne']) {
    if (typeof b.templates?.[key] === 'string') t[key] = b.templates[key].slice(0, 3000);
  }
  const k = await db();
  await k('events').where({ id: ev.id }).update({ templates: JSON.stringify(t) });
  await audit({ user: u, eventId: ev.id, action: 'templates.save', req });
  return { ok: true };
};

A['card.save'] = async (u, b, req) => {
  if (!can(u.role, 'cards.edit')) bad('Not allowed', 403);
  const k = await db();
  const html = b.html == null ? null : sanitizeCard(String(b.html).slice(0, 200000));
  if (b.scope === 'series') {
    const sid = int(b.series_id);
    if (!sid) bad('Choose a series.');
    await k('series').where({ id: sid }).update({ card_html: html });
    if (int(b.event_id)) await k('events').where({ id: int(b.event_id) }).update({ card_mode: 'series', series_id: sid });
    await audit({ user: u, eventId: int(b.event_id), action: 'card.save', details: `series #${sid}`, req });
  } else {
    const ev = await needEvent(b.event_id);
    const mode = b.mode === 'builtin' ? 'builtin' : 'event';
    await k('events').where({ id: ev.id }).update({ card_mode: mode, card_html: mode === 'event' ? html : ev.card_html });
    await audit({ user: u, eventId: ev.id, action: 'card.save', details: mode, req });
  }
  return { ok: true };
};

A['card.preview'] = async (u, b) => {
  if (!can(u.role, 'cards.edit')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const { renderCard } = await import('@/lib/cards');
  const { qrDataUrl } = await import('@/lib/guest');
  const html = renderCard(String(b.html || '').slice(0, 200000), {
    event: ev, functions: ev.functions, invitee: { rank: 'Col', name: 'R K Thapa' }, regiment: await regimentName(),
    crestUrl: '/api/logo/512', qrUrl: await qrDataUrl('SAMPLE0000'),
  });
  return { html };
};

// ---------- invitees & invitations ----------
function inviteeRow(b) {
  const category = CATEGORY_IDS.includes(b.category) ? b.category : null;
  const name = cleanName(b.name);
  if (!category) bad('Choose a category.');
  if (!name || !isLatinName(name)) bad('Enter the name in English letters.');
  const mobile = b.mobile ? normalizeMobile(b.mobile) : null;
  if (b.mobile && !mobile) bad('Mobile number is not valid.');
  return { category, rank: str(b.rank, 60), name, mobile, city: str(b.city, 100), lang: ['en', 'hi', 'ne'].includes(b.lang) ? b.lang : 'en', notes: str(b.notes, 300) };
}

A['invitee.save'] = async (u, b, req) => {
  if (!can(u.role, 'invitees.manage')) bad('Not allowed', 403);
  const k = await db();
  const row = inviteeRow(b);
  let id = int(b.id);
  if (id) {
    await k('invitees').where({ id }).update(row);
    // keep the "self" member's name in sync
    const invs = await k('invitations').where({ invitee_id: id }).select('id');
    if (invs.length) await k('members').whereIn('invitation_id', invs.map((x) => x.id)).andWhere({ relation: 'self' }).update({ name: displayName(row) });
    if (invs.length && row.category === 'officer') await k('invitations').where({ invitee_id: id }).update({ guestroom_eligible: true });
  } else {
    if (row.mobile && (await k('invitees').where({ mobile: row.mobile }).whereRaw('LOWER(name) = ?', [row.name.toLowerCase()]).first())) bad('This person (same name and mobile) is already in the directory.');
    [id] = await k('invitees').insert({ ...row, created_at: new Date() });
  }
  if (int(b.event_id)) {
    const ev = await needEvent(b.event_id);
    const invitee = await k('invitees').where({ id }).first();
    await k.transaction((trx) => ensureInvitation(trx, ev, invitee, b.extra_cap === '' || b.extra_cap == null ? undefined : Number(b.extra_cap)));
  }
  await audit({ user: u, eventId: int(b.event_id), action: b.id ? 'invitee.update' : 'invitee.create', details: displayName(row), req });
  return { id };
};

A['invite.add'] = async (u, b, req) => {
  if (!can(u.role, 'invitees.manage')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const k = await db();
  let q = k('invitees');
  if (Array.isArray(b.ids) && b.ids.length) q = q.whereIn('id', b.ids.map(int).filter(Boolean));
  else if (b.category) q = q.where({ category: b.category });
  else if (!b.all) bad('Choose who to invite.');
  const people = await q;
  let added = 0;
  await k.transaction(async (trx) => {
    for (const p of people) { const r = await ensureInvitation(trx, ev, p); if (r.created) added++; }
  });
  await audit({ user: u, eventId: ev.id, action: 'invite.add', details: `${added} added`, req });
  return { added };
};

A['inv.remove'] = async (u, b, req) => {
  if (!can(u.role, 'guests.edit')) bad('Not allowed', 403);
  const inv = await needInv(u, b.id);
  const name = await invName(inv.id);
  const k = await db();
  await k('invitations').where({ id: inv.id }).del();
  await audit({ user: u, eventId: inv.event_id, action: 'inv.remove', details: name, req });
  return { ok: true };
};

A['inv.rsvp'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'guests.edit');
  const ev = await needEvent(inv.event_id);
  const r = await saveRsvp(inv.id, ev, b, { byAdmin: true });
  await audit({ user: u, eventId: ev.id, invitationId: inv.id, action: 'inv.rsvp', details: `${await invName(inv.id)}: ${r.status}, ${r.count} person(s)`, req });
  return r;
};

A['inv.settings'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'guests.edit');
  const k = await db();
  const upd = {};
  if (b.extra_cap != null) upd.extra_cap = Math.max(0, Math.min(10, Number(b.extra_cap) || 0));
  if (b.guestroom_eligible != null) upd.guestroom_eligible = !!b.guestroom_eligible;
  if (Object.keys(upd).length) await k('invitations').where({ id: inv.id }).update(upd);
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: 'inv.settings', details: `${await invName(inv.id)}: ${JSON.stringify(upd)}`, req });
  return { ok: true };
};

A['inv.resetPin'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'pin.reset');
  const k = await db();
  const upd = { pin: newPin(), pin_failures: 0, pin_locked_until: null };
  if (b.newLink) upd.token = newToken();
  await k('invitations').where({ id: inv.id }).update(upd);
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: b.newLink ? 'inv.resetPinAndLink' : 'inv.resetPin', details: await invName(inv.id), req });
  const msg = await buildMessage(req, inv.id, 'invite');
  return { pin: upd.pin, link: `${siteUrl(req)}/i/${upd.token || inv.token}`, wa: msg.wa };
};

A['inv.message'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'invites.send');
  const kind = b.kind === 'reminder' ? 'reminder' : 'invite';
  const m = await buildMessage(req, inv.id, kind);
  const out = { text: m.text, wa: m.wa, mobile: m.mobile, pdfLink: m.pdfLink, cardPng: m.cardPng, fileName: m.fileName, cardMode: m.cardMode, name: [m.inv.rank, m.inv.name].filter(Boolean).join(' ') };
  // Custom HTML cards are turned into an image on the sender's device
  if (b.withCard && m.cardMode !== 'builtin') {
    const ev = await getEvent(inv.event_id);
    const k = await db();
    const invitee = await k('invitees').where({ id: inv.invitee_id }).first();
    out.cardHtml = await cardHtmlFor(ev, invitee, inv.checkin_code);
  }
  return out;
};

A['inv.markSent'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'invites.send');
  const k = await db();
  const kind = b.kind === 'reminder' ? 'reminder' : 'invite';
  const upd = kind === 'invite'
    ? { invite_sent_at: new Date(), invite_sent_by: u.id, invite_send_count: inv.invite_send_count + 1, claimed_by: null, claimed_at: null }
    : { reminder_sent_at: new Date(), reminder_sent_by: u.id, claimed_by: null, claimed_at: null };
  await k('invitations').where({ id: inv.id }).update(upd);
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: `${kind}.sent`, details: await invName(inv.id), req });
  return { ok: true };
};

// Queue: next guest to message. Claims it for 10 minutes so two coordinators don't double-send.
A['queue.next'] = async (u, b, req) => {
  const ev = await needEvent(b.event_id);
  const kind = b.kind === 'reminder' ? 'reminder' : 'invite';
  if (!can(u.role, 'invites.send') && !can(u.role, 'invites.send_own')) bad('Not allowed', 403);
  const k = await db();
  const stale = new Date(Date.now() - 10 * 60000);
  const q = k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id')
    .where('i.event_id', ev.id).whereNotNull('p.mobile')
    .where((w) => w.whereNull('i.claimed_by').orWhere('i.claimed_by', u.id).orWhere('i.claimed_at', '<', stale));
  if (kind === 'invite') q.whereNull('i.invite_sent_at');
  else q.whereNull('i.reminder_sent_at').whereNot('i.rsvp_status', 'declined');
  if (!can(u.role, 'invites.send') || b.mine) q.where('i.handler_id', u.id);
  if (b.category) q.where('p.category', b.category);
  if (b.skip?.length) q.whereNotIn('i.id', b.skip.map(int).filter(Boolean));
  const remaining = Number((await q.clone().count({ n: '*' }).first()).n);
  const next = await q.select('i.id').orderBy([{ column: 'p.category' }, { column: 'p.name' }]).first();
  if (!next) return { done: true, remaining: 0 };
  await k('invitations').where({ id: next.id }).update({ claimed_by: u.id, claimed_at: new Date() });
  const m = await buildMessage(req, next.id, kind);
  return { id: next.id, name: await invName(next.id), mobile: m.mobile, text: m.text, wa: m.wa, pdfLink: m.pdfLink, cardPng: m.cardPng, remaining };
};

// ---------- handlers (who looks after whom) ----------
async function handlerUser(id) {
  const k = await db();
  const h = await k('users').where({ id: int(id) || 0, active: true }).first();
  if (!h || !ROLES[h.role]?.handler) bad('Choose an active Super Admin, Coordinator or Liaison Officer.');
  return h;
}
A['inv.assign'] = async (u, b, req) => {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.ids]).map(int).filter(Boolean);
  if (!ids.length) bad('Select at least one guest.');
  const to = b.to === null || b.to === '' ? null : await handlerUser(b.to);
  const k = await db();
  const invs = await k('invitations').whereIn('id', ids);
  for (const inv of invs) {
    const isAdmin = can(u.role, 'guests.assign');
    if (!isAdmin && !(can(u.role, 'guests.transfer_own') && inv.handler_id === u.id)) bad('You can only transfer guests you look after.', 403);
    if (!isAdmin && !to) bad('Choose who to transfer to.');
  }
  await k('invitations').whereIn('id', ids).update({ handler_id: to ? to.id : null });
  const names = [];
  for (const inv of invs.slice(0, 15)) names.push(await invName(inv.id));
  await audit({ user: u, eventId: invs[0]?.event_id, action: can(u.role, 'guests.assign') ? 'guests.assign' : 'guests.transfer', details: `${invs.length} guest(s) → ${to ? to.name : 'Unassigned'}: ${names.join(', ')}${invs.length > 15 ? '…' : ''}`, req });
  if (to && to.id !== u.id) {
    await notifyUsers([to.id], { eventId: invs[0]?.event_id, title: `${u.name} assigned ${invs.length} guest(s) to you`, body: names.join(', '), url: `/admin/e/${invs[0]?.event_id}/guests?handler=me` });
  }
  return { ok: true, count: invs.length };
};

// ---------- guest rooms ----------
A['room.save'] = async (u, b, req) => {
  if (!can(u.role, 'rooms.manage')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const k = await db();
  const name = str(b.name, 80);
  if (!name) bad('Room name is required.');
  const row = { event_id: ev.id, name, location: str(b.location, 160), notes: str(b.notes, 300) };
  let id = int(b.id);
  if (id) await k('rooms').where({ id, event_id: ev.id }).update(row);
  else [id] = await k('rooms').insert({ ...row, created_at: new Date() });
  await audit({ user: u, eventId: ev.id, action: b.id ? 'room.update' : 'room.create', details: `${name}${row.location ? `, ${row.location}` : ''}`, req });
  return { id };
};
A['room.bulk'] = async (u, b, req) => {
  if (!can(u.role, 'rooms.manage')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const lines = String(b.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 300);
  const k = await db();
  const rows = lines.map((l) => { const [name, location, notes] = l.split(/\s*[,|\t]\s*/); return { event_id: ev.id, name: name.slice(0, 80), location: location?.slice(0, 160) || null, notes: notes?.slice(0, 300) || null, created_at: new Date() }; });
  if (!rows.length) bad('Type one room per line.');
  await k('rooms').insert(rows);
  await audit({ user: u, eventId: ev.id, action: 'room.bulk', details: `${rows.length} rooms added`, req });
  return { added: rows.length };
};
A['room.delete'] = async (u, b, req) => {
  if (!can(u.role, 'rooms.manage')) bad('Not allowed', 403);
  const k = await db();
  const r = await k('rooms').where({ id: int(b.id) || 0 }).first();
  if (!r) bad('Not found', 404);
  await k('rooms').where({ id: r.id }).del();
  await audit({ user: u, eventId: r.event_id, action: 'room.delete', details: r.name, req });
  return { ok: true };
};
A['room.allot'] = async (u, b, req) => {
  if (!can(u.role, 'rooms.manage')) bad('Not allowed', 403);
  const k = await db();
  const room = await k('rooms').where({ id: int(b.room_id) || 0 }).first();
  if (!room) bad('Room not found.', 404);
  const inv = await needInv(u, b.invitation_id);
  if (inv.event_id !== room.event_id) bad('Room belongs to another event.');
  const taken = await k('room_allotments').where({ room_id: room.id }).first();
  if (taken && taken.invitation_id !== inv.id) bad(`${room.name} is already allotted. Free it first.`);
  if (!taken) await k('room_allotments').insert({ room_id: room.id, invitation_id: inv.id, allotted_by: u.id, allotted_at: new Date() });
  const who = await invName(inv.id);
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: 'room.allot', details: `${room.name} → ${who}`, req });
  if (inv.handler_id && inv.handler_id !== u.id) await notifyGuestChange({ eventId: inv.event_id, invitation: { id: inv.id, handler_id: inv.handler_id }, title: `Room allotted to ${who}`, body: `${room.name}${room.location ? `, ${room.location}` : ''}`, url: `/admin/e/${inv.event_id}/rooms` });
  return { ok: true };
};
A['room.unallot'] = async (u, b, req) => {
  if (!can(u.role, 'rooms.manage')) bad('Not allowed', 403);
  const k = await db();
  const a = await k('room_allotments as a').join('rooms as r', 'r.id', 'a.room_id').where('a.room_id', int(b.room_id) || 0).select('a.*', 'r.name', 'r.event_id').first();
  if (!a) return { ok: true };
  await k('room_allotments').where({ room_id: a.room_id }).del();
  await audit({ user: u, eventId: a.event_id, invitationId: a.invitation_id, action: 'room.unallot', details: `${a.name} freed from ${await invName(a.invitation_id)}`, req });
  return { ok: true };
};
A['inv.guestroom'] = async (u, b, req) => {
  // admin/handler sets guest room need on the officer's behalf
  const inv = await needInv(u, b.id, 'guests.edit');
  const k = await db();
  if (!b.required) {
    await k('invitations').where({ id: inv.id }).update({ guestroom_required: false, guestroom_eta: null, guestroom_etd: null });
    await k('room_allotments').where({ invitation_id: inv.id }).del();
  } else {
    const eta = istInputToDate(b.eta); const etd = istInputToDate(b.etd);
    if (!eta || !etd) bad('Enter both ETA and ETD.');
    if (etd <= eta) bad('ETD must be after ETA.');
    const rooms = Math.round(Number(b.rooms) || 1);
    if (rooms < 1 || rooms > 10) bad('Rooms must be between 1 and 10.');
    await k('invitations').where({ id: inv.id }).update({ guestroom_eligible: true, guestroom_required: true, guestroom_eta: eta, guestroom_etd: etd, rooms_required: rooms });
  }
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: 'inv.guestroom', details: `${await invName(inv.id)}: ${b.required ? `${b.rooms} room(s) ${b.eta} → ${b.etd}` : 'not required'}`, req });
  return { ok: true };
};
A['inv.note'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'guests.edit');
  const note = await saveGuestroomNote(inv.id, { note: b.note, visible: b.visible }, u);
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: 'room.comment', details: `${await invName(inv.id)}: ${note || '(cleared)'}`, req });
  return { note };
};

// ---------- check-in ----------
A['checkin.lookup'] = async (u, b) => {
  if (!can(u.role, 'checkin.mark') && !can(u.role, 'checkin.mark_own')) bad('Not allowed', 403);
  const k = await db();
  const code = String(b.code || '').replace(/^KLN-/i, '').trim().toUpperCase();
  const inv = await k('invitations').where({ checkin_code: code, event_id: int(b.event_id) || 0 }).first();
  if (!inv) bad('This QR is not for this event, or is not valid.', 404);
  return { id: inv.id };
};
A['checkin.search'] = async (u, b) => {
  if (!can(u.role, 'checkin.mark') && !can(u.role, 'checkin.mark_own')) bad('Not allowed', 403);
  const k = await db();
  const words = String(b.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return { results: [] };
  const q = k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.event_id', int(b.event_id) || 0);
  for (const w of words) {
    const like = `%${w.replace(/[%_]/g, '')}%`;
    q.where((x) => x.whereRaw('LOWER(p.name) LIKE ?', [like]).orWhereRaw('LOWER(p.rank) LIKE ?', [like]).orWhereRaw('LOWER(p.city) LIKE ?', [like]).orWhere('p.mobile', 'like', like)
      .orWhereExists(function () { this.select(1).from('members as m').whereRaw('m.invitation_id = i.id').andWhereRaw('LOWER(m.name) LIKE ?', [like]); }));
  }
  if (!can(u.role, 'checkin.mark')) q.where('i.handler_id', u.id);
  const rows = await q.select('i.id', 'i.rsvp_status', 'p.rank', 'p.name', 'p.category', 'p.city').limit(25);
  return { results: rows.map((r) => ({ id: r.id, name: [r.rank, r.name].filter(Boolean).join(' '), category: r.category, city: r.city, rsvp: r.rsvp_status })) };
};
A['checkin.party'] = async (u, b) => {
  const inv = await needInv(u, b.id, 'checkin.mark');
  const full = await loadInvitation({ id: inv.id });
  return {
    id: inv.id, name: displayName(full.invitee), category: full.invitee.category, city: full.invitee.city, rsvp: inv.rsvp_status,
    members: full.members.map((m) => ({ id: m.id, name: m.name, relation: m.relation, age_group: m.age_group, meal: m.meal, is_walkin: !!m.is_walkin,
      fn: Object.fromEntries(Object.entries(m.functions).map(([f, v]) => [f, { attending: v.attending, attendance: v.attendance }])) })),
  };
};
A['checkin.stats'] = async (u, b) => {
  const k = await db();
  const fid = int(b.function_id) || 0;
  const r = await k('member_functions as mf').join('members as m', 'm.id', 'mf.member_id').where('mf.function_id', fid)
    .select(k.raw('SUM(CASE WHEN mf.attending = 1 AND m.is_walkin = 0 THEN 1 ELSE 0 END) as expected'), k.raw("SUM(CASE WHEN mf.attendance = 'present' THEN 1 ELSE 0 END) as present")).first();
  return { expected: Number(r?.expected || 0), present: Number(r?.present || 0) };
};
A['checkin.mark'] = async (u, b, req) => {
  const k = await db();
  const m = await k('members').where({ id: int(b.member_id) || 0 }).first();
  if (!m) bad('Person not found.', 404);
  const inv = await needInv(u, m.invitation_id, 'checkin.mark');
  const f = await k('functions').where({ id: int(b.function_id) || 0, event_id: inv.event_id }).first();
  if (!f) bad('Function not found.', 404);
  const status = ['present', 'absent'].includes(b.status) ? b.status : null;
  await k('member_functions').insert({ member_id: m.id, function_id: f.id, attending: false, attendance: status, marked_at: status ? new Date() : null, marked_by: status ? u.id : null })
    .onConflict(['member_id', 'function_id']).merge({ attendance: status, marked_at: status ? new Date() : null, marked_by: status ? u.id : null });
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: 'checkin.mark', details: `${m.name} · ${f.name}: ${status || 'cleared'}`, req });
  return { ok: true };
};
A['checkin.walkin'] = async (u, b, req) => {
  if (!can(u.role, 'checkin.mark') && !can(u.role, 'checkin.mark_own')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const f = ev.functions.find((x) => x.id === int(b.function_id));
  if (!f) bad('Choose the function.');
  const name = cleanName(b.name);
  if (!name || !isLatinName(name)) bad('Enter the name in English letters.');
  const k = await db();
  let invId = int(b.invitation_id);
  if (invId) await needInv(u, invId, 'checkin.mark');
  else {
    if (!can(u.role, 'checkin.mark')) bad('Not allowed', 403);
    const [pid] = await k('invitees').insert({ category: CATEGORY_IDS.includes(b.category) ? b.category : 'civilian', rank: str(b.rank, 60), name, mobile: normalizeMobile(b.mobile), created_at: new Date() });
    const invitee = await k('invitees').where({ id: pid }).first();
    const r = await k.transaction((trx) => ensureInvitation(trx, ev, invitee, 0));
    invId = r.invitation.id;
    await k('invitations').where({ id: invId }).update({ is_walkin: true, rsvp_status: 'attending' });
    await k('members').where({ invitation_id: invId, relation: 'self' }).update({ is_walkin: true, walkin_review: 'pending', added_by_user: u.id });
    const self = await k('members').where({ invitation_id: invId, relation: 'self' }).first();
    await k('member_functions').insert({ member_id: self.id, function_id: f.id, attending: false, attendance: 'present', marked_at: new Date(), marked_by: u.id });
    await audit({ user: u, eventId: ev.id, invitationId: invId, action: 'checkin.walkin', details: `New party: ${name} at ${f.name}`, req });
    return { invitation_id: invId };
  }
  const [mid] = await k('members').insert({
    invitation_id: invId, name, relation: RELATIONS.includes(b.relation) && b.relation !== 'self' ? b.relation : 'other',
    age_group: AGE_GROUPS.includes(b.age_group) ? b.age_group : 'adult', meal: 'veg', is_walkin: true, walkin_review: 'pending', added_by_user: u.id, sort: 99,
  });
  await k('member_functions').insert({ member_id: mid, function_id: f.id, attending: false, attendance: 'present', marked_at: new Date(), marked_by: u.id });
  await audit({ user: u, eventId: ev.id, invitationId: invId, action: 'checkin.walkin', details: `${name} added to ${await invName(invId)} at ${f.name}`, req });
  return { invitation_id: invId };
};
A['walkin.review'] = async (u, b, req) => {
  if (!can(u.role, 'walkins.review')) bad('Not allowed', 403);
  const k = await db();
  const m = await k('members').where({ id: int(b.member_id) || 0 }).first();
  if (!m?.is_walkin) bad('Not a walk-in.', 404);
  const decision = b.decision === 'rejected' ? 'rejected' : 'approved';
  await k('members').where({ id: m.id }).update({ walkin_review: decision });
  const inv = await k('invitations').where({ id: m.invitation_id }).first();
  await audit({ user: u, eventId: inv.event_id, invitationId: inv.id, action: 'walkin.review', details: `${m.name}: ${decision}`, req });
  return { ok: true };
};

// ---------- users ----------
A['user.save'] = async (u, b, req) => {
  if (!can(u.role, 'users.manage')) bad('Only the Super Admin can manage users.', 403);
  const k = await db();
  const name = cleanName(b.name);
  const username = String(b.username || '').trim().toLowerCase();
  if (!name || !/^[a-z0-9._-]{3,40}$/.test(username)) bad('Enter a name and a username (3–40 letters, numbers, . _ -).');
  if (!ROLE_IDS.includes(b.role)) bad('Choose a role.');
  const row = { name, username, role: b.role, phone: normalizeMobile(b.phone), active: b.active !== false, notify_all: !!b.notify_all };
  let id = int(b.id);
  if (id) {
    if (id === u.id && (row.role !== 'super_admin' || !row.active)) bad('You cannot remove your own Super Admin access.');
    const old = await k('users').where({ id }).first();
    const upd = { ...row };
    if (b.password) {
      if (String(b.password).length < 8) bad('Password must be at least 8 characters.');
      upd.password_hash = await bcrypt.hash(b.password, 11);
    }
    if (b.reset2fa) { upd.totp_enabled = false; upd.totp_secret = null; }
    if (b.password || b.reset2fa || !row.active || old.role !== row.role) upd.session_version = old.session_version + 1;
    await k('users').where({ id }).update(upd);
  } else {
    if (await k('users').where({ username }).first()) bad('That username is taken.');
    if (String(b.password || '').length < 8) bad('Set a temporary password of at least 8 characters.');
    [id] = await k('users').insert({ ...row, password_hash: await bcrypt.hash(b.password, 11), created_at: new Date() });
  }
  await audit({ user: u, action: b.id ? 'user.update' : 'user.create', details: `${name} (${username}) · ${ROLES[b.role].label}${b.reset2fa ? ' · 2FA reset' : ''}${b.password ? ' · password set' : ''}`, req });
  return { id };
};

// ---------- settings ----------
A['settings.save'] = async (u, b, req) => {
  if (!can(u.role, 'settings.manage')) bad('Only the Super Admin can change settings.', 403);
  const changed = [];
  for (const key of ['regiment_name', 'credit_text', 'war_cry']) {
    if (typeof b[key] === 'string') { await setSetting(key, b[key].trim().slice(0, 200)); changed.push(key); }
  }
  await audit({ user: u, action: 'settings.save', details: changed.join(', '), req });
  return { ok: true };
};
A['logo.save'] = async (u, b, req) => {
  if (!can(u.role, 'settings.manage')) bad('Only the Super Admin can change the crest.', 403);
  const ok = (s) => typeof s === 'string' && /^data:image\/png;base64,/.test(s) && s.length < 1_500_000;
  if (b.reset) {
    await setSetting('logo_512', ''); await setSetting('logo_192', ''); await setSetting('logo_maskable', '');
  } else {
    if (!ok(b.png512) || !ok(b.png192) || !ok(b.maskable)) bad('Please upload a PNG or JPG image.');
    await setSetting('logo_512', b.png512.split(',')[1]);
    await setSetting('logo_192', b.png192.split(',')[1]);
    await setSetting('logo_maskable', b.maskable.split(',')[1]);
  }
  await setSetting('logo_version', String(Date.now()));
  await audit({ user: u, action: 'logo.save', details: b.reset ? 'reset to default' : 'new crest uploaded', req });
  return { ok: true };
};

export const POST = handler(async (req) => {
  const user = await getAdmin();
  if (!user) throw new HttpError(401, 'Please log in again.');
  const b = await body(req);
  const fn = A[b.action];
  if (!fn) bad('Unknown action');
  return fn(user, b, req);
});

