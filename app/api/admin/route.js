import bcrypt from 'bcryptjs';
import { handler, body, bad, audit } from '@/lib/api';
import { db } from '@/lib/db';
import { getAdmin, HttpError } from '@/lib/auth';
import { can, canOn, canEditEvent, ROLES, roleIds, MODULE_IDS } from '@/lib/rbac';
import { rolesChanged, loadRoles } from '@/lib/roles';
import { getEvent, loadInvitation, saveRsvp, ensureInvitation, displayName, saveGuestroomNote } from '@/lib/data';
import {
  CATEGORY_IDS, cleanName, isLatinName, normalizeMobile, istInputToDate, newPin, newToken, newCheckinCode,
  RELATIONS, AGE_GROUPS, siteUrl, fmtShort,
} from '@/lib/util';
import { setSetting, getSetting } from '@/lib/settings';
import { xbConfig, xbChannels, xbTemplates, xbSendTemplate, XB_DEFAULT_BASE } from '@/lib/xpressbot';
import { KINDS, TEMPLATE_TEXT, queueBulk, queueConfirmation, rememberSite, templateFor, schedule, signedCardUrl } from '@/lib/wa';
import { buildMessage } from '@/lib/messages';
import { cardHtmlFor } from '@/lib/guest';
import { assignSlug, guestPath, EVENT_CODE_RE } from '@/lib/links';
import { sanitizeCard } from '@/lib/cards';
import { saveSubscription, vapidPublicKey, notifyUsers, notifyGuestChange, saveNativeToken } from '@/lib/notify';
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
// iOS app: register this phone's push token
A['push.native'] = async (u, b) => {
  if (!/^[0-9a-fA-F]{32,200}$/.test(String(b.token || ''))) bad('Invalid device token');
  await saveNativeToken(u, b.token, b.device);
  return { ok: true };
};
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
  if (int(b.id) ? !canEditEvent(u.role) : !can(u.role, 'events.manage')) bad('Not allowed', 403);
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
  if (b.diet_notes_enabled != null) row.diet_notes_enabled = !!b.diet_notes_enabled;
  if (b.starts_at !== undefined) row.starts_at = istInputToDate(b.starts_at);
  for (const key of ['wa_reminders', 'wa_confirm', 'wa_eventday']) if (b[key] != null) row[key] = !!b[key];
  if (row.map_url && !/^https?:\/\//i.test(row.map_url)) bad('Directions link must start with https://');
  let id = int(b.id);
  if (b.code != null && String(b.code).trim() !== '') {
    const code = String(b.code).trim().toLowerCase();
    if (!EVENT_CODE_RE.test(code)) bad('Link code: use 1–24 lower-case letters, numbers or hyphens (e.g. rgt26).');
    const clash = await k('events').whereRaw('LOWER(code) = ?', [code]).whereNot({ id: id || 0 }).first();
    if (clash) bad(`Link code "${code}" is already used by "${clash.name}".`);
    row.code = code;
  }
  if (id) await k('events').where({ id }).update(row);
  else {
    [id] = await k('events').insert({ ...row, card_unit: row.card_unit || (await regimentName()), created_at: new Date() });
    if (!row.code) await k('events').where({ id }).update({ code: (await k('events').where({ code: String(id) }).first()) ? `e${id}` : String(id) });
  }
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
  if (!canEditEvent(u.role)) bad('Not allowed', 403);
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
  if (!canEditEvent(u.role)) bad('Not allowed', 403);
  const k = await db();
  const f = await k('functions').where({ id: int(b.id) || 0 }).first();
  if (!f) bad('Not found', 404);
  await k('functions').where({ id: f.id }).del();
  await audit({ user: u, eventId: f.event_id, action: 'function.delete', details: f.name, req });
  return { ok: true };
};

A['templates.save'] = async (u, b, req) => {
  if (!canEditEvent(u.role)) bad('Not allowed', 403);
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
  if (!can(u.role, 'cards.edit') && !can(u.role, 'events.edit')) bad('Not allowed', 403);
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
  if (!can(u.role, 'cards.edit') && !can(u.role, 'events.edit')) bad('Not allowed', 403);
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
  return { category, rank: str(b.rank, 60), name, mobile, city: str(b.city, 100), lang: ['en', 'hi', 'ne'].includes(b.lang) ? b.lang : 'en', notes: str(b.notes, 300), ...(b.vip != null ? { vip: !!b.vip } : {}) };
}

A['invitee.save'] = async (u, b, req) => {
  if (!can(u.role, 'invitees.manage')) bad('Not allowed', 403);
  const k = await db();
  const row = inviteeRow(b);
  let id = int(b.id);
  if (id) {
    const before = await k('invitees').where({ id }).first();
    await k('invitees').where({ id }).update(row);
    // mobile changed: their readable links follow the new number
    if (before && before.mobile !== row.mobile) {
      for (const x of await k('invitations').where({ invitee_id: id }).select('id', 'event_id')) await assignSlug(k, x.id, x.event_id, row.mobile);
    }
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
  if (!can(u.role, 'guests.edit') && !can(u.role, 'records.delete')) bad('Not allowed', 403);
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(int).filter(Boolean).slice(0, 2000);
  if (!ids.length) bad('Choose guests to remove.');
  const k = await db();
  let n = 0;
  for (const id of ids) {
    const inv = await needInv(u, id);
    const name = await invName(inv.id);
    await k('invitations').where({ id: inv.id }).del();
    await audit({ user: u, eventId: inv.event_id, action: 'inv.remove', details: name, req });
    n++;
  }
  return { ok: true, count: n };
};

// Delete people from the invitee directory (and from every event they were invited to)
A['invitee.delete'] = async (u, b, req) => {
  if (!can(u.role, 'records.delete')) bad('Your role cannot delete records.', 403);
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(int).filter(Boolean).slice(0, 5000);
  if (!ids.length) bad('Choose invitees to delete.');
  const k = await db();
  const rows = await k('invitees').whereIn('id', ids).select('id', 'rank', 'name');
  await k('invitees').whereIn('id', rows.map((r) => r.id)).del();
  await audit({ user: u, action: 'invitee.delete', details: `${rows.length}: ${rows.slice(0, 20).map(displayName).join(', ')}${rows.length > 20 ? '…' : ''}`, req });
  return { count: rows.length };
};

A['inv.rsvp'] = async (u, b, req) => {
  const inv = await needInv(u, b.id, 'guests.edit');
  const ev = await needEvent(inv.event_id);
  const r = await saveRsvp(inv.id, ev, b, { byAdmin: true });
  await audit({ user: u, eventId: ev.id, invitationId: inv.id, action: 'inv.rsvp', details: `${await invName(inv.id)}: ${r.status}, ${r.count} person(s)`, req });
  // WhatsApp "we have noted your reply" when a liaison officer / admin fills in the reply (if on for this event)
  const waQueued = await queueConfirmation(inv.id).catch((e) => { console.error('[wa] confirm', e.message); return false; });
  return { ...r, waQueued: !!waQueued };
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
  const ev = await k('events').where({ id: inv.event_id }).select('code').first();
  return { pin: upd.pin, link: `${siteUrl(req)}${guestPath(ev?.code, { ...inv, ...upd })}`, wa: msg.wa };
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
  if (!can(u.role, 'rooms.manage') && !can(u.role, 'records.delete')) bad('Not allowed', 403);
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
// Offline gate: everything the check-in screen needs for one event, to keep on the device
A['checkin.snapshot'] = async (u, b) => {
  if (!can(u.role, 'checkin.mark') && !can(u.role, 'checkin.mark_own')) bad('Not allowed', 403);
  const ev = await needEvent(b.event_id);
  const k = await db();
  const q = k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.event_id', ev.id)
    .select('i.id', 'i.rsvp_status', 'i.checkin_code', 'i.handler_id', 'p.rank', 'p.name', 'p.category', 'p.city', 'p.mobile');
  if (!can(u.role, 'checkin.mark')) q.where('i.handler_id', u.id);
  const invs = await q;
  const ids = invs.map((i) => i.id);
  const members = ids.length ? await k('members').whereIn('invitation_id', ids).orderBy([{ column: 'sort' }, { column: 'id' }]) : [];
  const mids = members.map((m) => m.id);
  const mfs = mids.length ? await k('member_functions').whereIn('member_id', mids) : [];
  const byM = new Map();
  for (const f of mfs) { if (!byM.has(f.member_id)) byM.set(f.member_id, {}); byM.get(f.member_id)[f.function_id] = { attending: !!f.attending, attendance: f.attendance, at: f.marked_at ? new Date(f.marked_at).getTime() : 0 }; }
  const byInv = new Map();
  for (const m of members) {
    if (!byInv.has(m.invitation_id)) byInv.set(m.invitation_id, []);
    byInv.get(m.invitation_id).push({ id: m.id, name: m.name, relation: m.relation, age_group: m.age_group, meal: m.meal, is_walkin: !!m.is_walkin, fn: byM.get(m.id) || {} });
  }
  return {
    at: Date.now(), event_id: ev.id,
    functions: ev.functions.map((f) => ({ id: f.id, name: f.name })),
    parties: invs.map((i) => {
      const ms = byInv.get(i.id) || [];
      const name = [i.rank, i.name].filter(Boolean).join(' ');
      return { id: i.id, name, category: i.category, city: i.city, rsvp: i.rsvp_status, code: i.checkin_code,
        search: [name, i.city, i.mobile, ...ms.map((m) => m.name)].filter(Boolean).join(' ').toLowerCase(), members: ms };
    }),
  };
};

// Offline gate: apply marks made without internet. The newest mark for a person wins.
A['checkin.sync'] = async (u, b, req) => {
  const marks = Array.isArray(b.marks) ? b.marks.slice(0, 5000) : [];
  const k = await db();
  let applied = 0, skipped = 0;
  for (const x of marks) {
    try {
      const m = await k('members').where({ id: int(x.member_id) || 0 }).first();
      if (!m) { skipped++; continue; }
      const inv = await needInv(u, m.invitation_id, 'checkin.mark');
      const f = await k('functions').where({ id: int(x.function_id) || 0, event_id: inv.event_id }).first();
      if (!f) { skipped++; continue; }
      const status = ['present', 'absent'].includes(x.status) ? x.status : null;
      const at = new Date(Math.min(Number(x.at) || Date.now(), Date.now()));
      const cur = await k('member_functions').where({ member_id: m.id, function_id: f.id }).first();
      if (cur?.marked_at && new Date(cur.marked_at) > at) { skipped++; continue; } // someone marked later online
      await k('member_functions').insert({ member_id: m.id, function_id: f.id, attending: false, attendance: status, marked_at: status ? at : null, marked_by: status ? u.id : null })
        .onConflict(['member_id', 'function_id']).merge({ attendance: status, marked_at: status ? at : null, marked_by: status ? u.id : null });
      applied++;
    } catch { skipped++; }
  }
  if (marks.length) await audit({ user: u, action: 'checkin.sync', details: `${applied} offline mark(s) synced${skipped ? `, ${skipped} skipped (newer mark or no access)` : ''}`, req });
  return { applied, skipped };
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
  if (!roleIds().includes(b.role)) bad('Choose a role.');
  const row = { name, username, role: b.role, phone: normalizeMobile(b.phone), active: b.active !== false, notify_all: !!b.notify_all };
  let id = int(b.id);
  if (id) {
    if (id === u.id && (!can(row.role, 'users.manage') || !row.active)) bad('You cannot remove your own access to Users & roles.');
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

A['user.delete'] = async (u, b, req) => {
  if (!can(u.role, 'users.manage')) bad('Not allowed', 403);
  const id = int(b.id);
  if (id === u.id) bad('You cannot delete your own account.');
  const k = await db();
  const t = await k('users').where({ id }).first();
  if (!t) bad('User not found.', 404);
  const guests = Number((await k('invitations').where({ handler_id: id }).count({ n: '*' }).first()).n);
  await k('users').where({ id }).del(); // their guests become unassigned
  await audit({ user: u, action: 'user.delete', details: `${t.name} (${t.username})${guests ? ` · ${guests} guests now unassigned` : ''}`, req });
  return { ok: true, unassigned: guests };
};

// ---------- clear data (Settings) ----------
// Groups of tables; clearing one also clears the groups that depend on it.
const CLEAR_GROUPS = {
  audit: { tables: ['audit_log'] },
  notifications: { tables: ['notifications'] },
  devices: { tables: ['push_subscriptions', 'native_push_tokens'] },
  attendance: { tables: ['member_functions (attendance only)'] },
  allotments: { tables: ['room_allotments'] },
  rooms: { tables: ['rooms'], implies: ['allotments'] },
  guests: { tables: ['invitations', 'members', 'member_functions'], implies: ['allotments', 'attendance'] },
  invitees: { tables: ['invitees'], implies: ['guests'] },
  events: { tables: ['events', 'functions', 'series'], implies: ['guests', 'rooms'] },
};
function closeGroups(list) {
  const out = new Set(list.filter((g) => CLEAR_GROUPS[g]));
  let grew = true;
  while (grew) { grew = false; for (const g of [...out]) for (const d of CLEAR_GROUPS[g].implies || []) if (!out.has(d)) { out.add(d); grew = true; } }
  return [...out];
}
async function clearCounts(k) {
  const c = async (t, w) => Number((await (w ? w(k(t)) : k(t)).count({ n: '*' }).first()).n);
  return {
    audit: await c('audit_log'), notifications: await c('notifications'),
    devices: (await c('push_subscriptions')) + (await c('native_push_tokens')),
    attendance: await c('member_functions', (q) => q.whereNotNull('attendance')),
    allotments: await c('room_allotments'), rooms: await c('rooms'),
    guests: await c('invitations'), invitees: await c('invitees'), events: await c('events'),
  };
}
A['data.counts'] = async (u) => {
  if (!can(u.role, 'data.clear')) bad('Not allowed', 403);
  return { counts: await clearCounts(await db()) };
};
A['data.clear'] = async (u, b, req) => {
  if (!can(u.role, 'data.clear')) bad('Your role cannot clear data.', 403);
  if (String(b.confirm || '').trim() !== 'DELETE') bad('Type DELETE to confirm.');
  const k = await db();
  const me = await k('users').where({ id: u.id }).first();
  if (!(await bcrypt.compare(String(b.password || ''), me.password_hash))) bad('Your password is not correct.', 401);
  const groups = closeGroups(Array.isArray(b.groups) ? b.groups : []);
  if (!groups.length) bad('Tick at least one item.');
  const before = await clearCounts(k);
  const has = (g) => groups.includes(g);
  await k.transaction(async (trx) => {
    if (has('events')) { await trx('events').del(); await trx('series').del(); }
    if (has('invitees')) await trx('invitees').del();
    if (has('guests')) await trx('invitations').del();
    if (has('rooms')) await trx('rooms').del();
    if (has('allotments')) await trx('room_allotments').del();
    if (has('attendance')) {
      await trx('member_functions').update({ attendance: null, marked_at: null, marked_by: null });
      await trx('members').where({ is_walkin: true }).del();
      await trx('invitations').where({ is_walkin: true }).del();
    }
    if (has('devices')) { await trx('push_subscriptions').del(); await trx('native_push_tokens').del(); }
    if (has('notifications')) await trx('notifications').del();
    if (has('audit')) await trx('audit_log').del();
  });
  const summary = groups.map((g) => `${g} (${before[g]})`).join(', ');
  await audit({ user: u, action: 'data.clear', details: summary, req }); // written after the clear, so it survives
  return { cleared: groups, counts: await clearCounts(k) };
};

// ---------- roles (made of modules) ----------
A['role.save'] = async (u, b, req) => {
  if (!can(u.role, 'users.manage')) bad('Not allowed', 403);
  const k = await db();
  const label = String(b.label || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (label.length < 2) bad('Give the role a name.');
  const modules = [...new Set((Array.isArray(b.modules) ? b.modules : []).filter((m) => MODULE_IDS.includes(m)))];
  if (!modules.length) bad('Tick at least one module.');
  let key = String(b.key || '');
  if (key) {
    const old = await k('roles').where({ key }).first();
    if (!old) bad('Role not found.', 404);
    if (key === 'super_admin') bad('The Super Admin role always has every module and cannot be changed.');
    // do not let the person editing remove their own access to Users & roles
    if (u.role === key && !modules.includes('users')) bad('You cannot remove Users & roles from your own role.');
    await k('roles').where({ key }).update({ label, twofa: !!b.twofa, modules: JSON.stringify(modules) });
    // everyone with this role signs in again so the new access applies cleanly
    await k('users').where({ role: key }).increment('session_version', 1);
  } else {
    const base = 'r_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    key = base; let n = 2;
    while (await k('roles').where({ key }).first()) key = `${base}_${n++}`;
    await k('roles').insert({ key, label, twofa: !!b.twofa, builtin: false, modules: JSON.stringify(modules), created_at: new Date() });
  }
  rolesChanged(); await loadRoles(true);
  await audit({ user: u, action: b.key ? 'role.update' : 'role.create', details: `${label}: ${modules.join(', ')}${b.twofa ? ' · 2-step login' : ''}`, req });
  return { key };
};

A['role.delete'] = async (u, b, req) => {
  if (!can(u.role, 'users.manage')) bad('Not allowed', 403);
  const k = await db();
  const r = await k('roles').where({ key: String(b.key || '') }).first();
  if (!r) bad('Role not found.', 404);
  if (r.key === 'super_admin') bad('The Super Admin role cannot be deleted.');
  const n = Number((await k('users').where({ role: r.key }).count({ n: '*' }).first()).n);
  if (n) bad(`${n} user(s) still have this role. Give them another role first.`);
  await k('roles').where({ key: r.key }).del();
  rolesChanged(); await loadRoles(true);
  await audit({ user: u, action: 'role.delete', details: r.label, req });
  return { ok: true };
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

// ---------- WhatsApp automation (Xpressbot) ----------
// Xpressbot problems (wrong key, template not approved…) are shown to the user as they are.
async function xbCall(fn) {
  try { return await fn(); } catch (e) { if (e?.name === 'Error' && 'retry' in e) bad(e.message, 400); throw e; }
}
async function xbState() {
  const cfg = await xbConfig();
  let templates = [];
  try { templates = JSON.parse((await getSetting('xb_templates')) || '[]'); } catch {}
  const chosen = {};
  for (const kind of Object.keys(KINDS)) chosen[kind] = await templateFor(kind);
  return {
    hasKey: !!cfg.key, keyEnd: cfg.key ? cfg.key.slice(-4) : '', enabled: cfg.enabled, base: cfg.base, defaultBase: XB_DEFAULT_BASE,
    channel: cfg.channel, channelLabel: (await getSetting('xb_channel_label')) || '', templates, chosen,
    inviteImage: (await getSetting('xb_invite_image')) !== '0', buttons: (await getSetting('xb_buttons')) !== '0', buttonParam: (await getSetting('xb_button_param')) || 'button', texts: TEMPLATE_TEXT, kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])),
  };
}

A['xb.state'] = async (u) => {
  if (!can(u.role, 'settings.manage')) bad('Not allowed', 403);
  return xbState();
};

A['xb.save'] = async (u, b, req) => {
  if (!can(u.role, 'settings.manage')) bad('Only the Super Admin can change WhatsApp automation.', 403);
  if (typeof b.key === 'string' && b.key.trim()) await setSetting('xb_key', b.key.trim());
  if (b.removeKey) { await setSetting('xb_key', ''); await setSetting('xb_enabled', '0'); }
  if (typeof b.base === 'string') {
    const base = b.base.trim().replace(/\/$/, '');
    if (base && !/^https:\/\/[^\s/]+\/\S*$/i.test(base) && !(process.env.KL_TEST === '1' && /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(base))) bad('API address must start with https://');
    await setSetting('xb_base', base);
  }
  if (typeof b.channel === 'string') { await setSetting('xb_channel', b.channel.trim()); if (b.channelLabel != null) await setSetting('xb_channel_label', String(b.channelLabel).slice(0, 120)); }
  if (b.templates && typeof b.templates === 'object') {
    for (const kind of Object.keys(KINDS)) if (typeof b.templates[kind] === 'string') await setSetting(KINDS[kind].setting, b.templates[kind].trim().slice(0, 120));
  }
  if (b.inviteImage != null) await setSetting('xb_invite_image', b.inviteImage ? '1' : '0');
  if (b.buttons != null) await setSetting('xb_buttons', b.buttons ? '1' : '0');
  if (typeof b.buttonParam === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(b.buttonParam.trim())) await setSetting('xb_button_param', b.buttonParam.trim());
  if (b.enabled != null) {
    if (b.enabled && !(await getSetting('xb_key'))) bad('Add the API key first.');
    await setSetting('xb_enabled', b.enabled ? '1' : '0');
  }
  await rememberSite(siteUrl(req));
  await audit({ user: u, action: 'xb.save', details: `WhatsApp automation ${b.enabled == null ? 'settings' : b.enabled ? 'on' : 'off'} updated`, req });
  return xbState();
};

A['xb.test'] = async (u, b, req) => {
  if (!can(u.role, 'settings.manage')) bad('Not allowed', 403);
  const cfg = await xbConfig();
  const channels = await xbCall(() => xbChannels(cfg));
  const list = Array.isArray(channels) ? channels : channels?.channels || [];
  // use the channel picked, or the only/first active one
  let ch = list.find((c) => c.id === cfg.channel) || list.find((c) => c.isActive !== false) || list[0];
  if (ch && ch.id !== cfg.channel) { await setSetting('xb_channel', ch.id); cfg.channel = ch.id; }
  if (ch) await setSetting('xb_channel_label', `${ch.name || ''}${ch.phoneNumberId ? ` · ${ch.phoneNumberId}` : ''}`);
  const t = await xbCall(() => xbTemplates(cfg));
  const tl = (Array.isArray(t) ? t : t?.templates || []).map((x) => ({ name: x.name, language: x.language || x.languageCode || '', status: String(x.status || '').toLowerCase(), category: x.category || '' }));
  await setSetting('xb_templates', JSON.stringify(tl));
  await rememberSite(siteUrl(req));
  return { ...(await xbState()), channels: list.map((c) => ({ id: c.id, name: c.name, phone: c.phoneNumberId, active: c.isActive !== false })) };
};

A['xb.testSend'] = async (u, b, req) => {
  if (!can(u.role, 'settings.manage')) bad('Not allowed', 403);
  const kind = KINDS[b.kind] ? b.kind : 'invite';
  const to = String(b.to || '').replace(/\D/g, '');
  if (to.length < 10) bad('Enter the mobile number with country code, e.g. 919812345678.');
  const t = TEMPLATE_TEXT[kind];
  let mediaUrl;
  if (kind === 'invite' && (await getSetting('xb_invite_image')) !== '0') {
    const k = await db();
    const any = await k('invitations').orderBy('id').first();
    mediaUrl = any ? await signedCardUrl(siteUrl(req), any.token, 1) : `${siteUrl(req)}/api/logo/512`;
  }
  const useButtons = (await getSetting('xb_buttons')) !== '0';
  const template = await templateFor(kind);
  const buttonParam = (await getSetting('xb_button_param')) || 'button';
  const r = await xbCall(() => xbSendTemplate({
    to, template, vars: t.vars.map((v) => v[1]), header: t.header.sample, mediaUrl,
    buttons: useButtons ? t.buttons.map((x) => x.sample) : [], buttonParam,
  }));
  await audit({ user: u, action: 'xb.testSend', details: `${KINDS[kind].label} test to +${to}`, req });
  return { ok: true, wamid: r.wamid };
};

A['wa.send'] = async (u, b, req) => {
  const ev = await needEvent(b.event_id);
  if (!can(u.role, 'invites.send')) bad('Not allowed', 403);
  const kind = b.kind === 'reminder' ? 'reminder' : 'invite';
  if (!(await xbConfig()).enabled) bad('WhatsApp automation is off. Turn it on in Settings › WhatsApp automation.');
  await rememberSite(siteUrl(req));
  const ids = Array.isArray(b.ids) ? b.ids.map(int).filter(Boolean) : null;
  const r = await queueBulk({ eventId: ev.id, kind, ids, userId: u.id });
  await audit({ user: u, eventId: ev.id, action: `wa.${kind}`, details: `Queued ${r.added} ${KINDS[kind].label.toLowerCase()} message(s) on WhatsApp`, req });
  return r;
};

A['wa.log'] = async (u, b) => {
  const ev = await needEvent(b.event_id);
  if (!can(u.role, 'invites.send') && !can(u.role, 'invites.send_own')) bad('Not allowed', 403);
  const k = await db();
  const rows = await k('wa_messages as w').leftJoin('invitations as i', 'i.id', 'w.invitation_id').leftJoin('invitees as p', 'p.id', 'i.invitee_id')
    .where('w.event_id', ev.id).orderBy('w.id', 'desc').limit(Math.min(500, int(b.limit) || 100))
    .select('w.id', 'w.kind', 'w.status', 'w.delivery', 'w.error', 'w.to', 'w.sent_at', 'w.created_at', 'w.send_after', 'w.invitation_id', 'p.rank', 'p.name');
  const counts = await k('wa_messages').where({ event_id: ev.id }).select('kind', 'status').count({ n: '*' }).groupBy('kind', 'status');
  const cfg = await xbConfig();
  return {
    enabled: cfg.enabled,
    rows: rows.map((r) => ({ ...r, name: [r.rank, r.name].filter(Boolean).join(' ') || '—', sent_at: r.sent_at ? fmtShort(r.sent_at) : null, created_at: fmtShort(r.created_at), send_after: fmtShort(r.send_after) })),
    counts: counts.map((c) => ({ kind: c.kind, status: c.status, n: Number(c.n) })),
    switches: { wa_reminders: !!ev.wa_reminders, wa_confirm: !!ev.wa_confirm, wa_eventday: !!ev.wa_eventday },
  };
};

A['wa.retry'] = async (u, b, req) => {
  const ev = await needEvent(b.event_id);
  if (!can(u.role, 'invites.send')) bad('Not allowed', 403);
  const k = await db();
  const n = await k('wa_messages').where({ event_id: ev.id, status: 'failed' }).update({ status: 'queued', send_after: new Date(), error: null, attempts: 0 });
  await audit({ user: u, eventId: ev.id, action: 'wa.retry', details: `${n} failed WhatsApp message(s) queued again`, req });
  return { n };
};

A['wa.cancel'] = async (u, b, req) => {
  const ev = await needEvent(b.event_id);
  if (!can(u.role, 'invites.send')) bad('Not allowed', 403);
  const k = await db();
  const n = await k('wa_messages').where({ event_id: ev.id, status: 'queued' }).update({ status: 'skipped', error: 'Cancelled' });
  await audit({ user: u, eventId: ev.id, action: 'wa.cancel', details: `${n} queued WhatsApp message(s) cancelled`, req });
  return { n };
};

A['wa.schedule'] = async (u, b) => {
  if (!can(u.role, 'settings.manage')) bad('Not allowed', 403);
  // a pretend time is only for automated tests
  return schedule(process.env.KL_TEST === '1' && b.at ? new Date(b.at) : new Date());
};

export const POST = handler(async (req) => {
  const user = await getAdmin();
  if (!user) throw new HttpError(401, 'Please log in again.');
  const b = await body(req);
  const fn = A[b.action];
  if (!fn) bad('Unknown action');
  return fn(user, b, req);
});

