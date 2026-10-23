// WhatsApp automation through Xpressbot: queue, message variables, background sender, schedule.
// Every message is a row in wa_messages (the log). A background loop sends one queued message
// every 3.5 s (under Xpressbot's 20 messages/minute) and adds automatic reminders / event-day
// passes every 5 minutes. `dedupe` is unique, so the same automatic message is never queued twice.
import crypto from 'crypto';
import { db } from './db';
import { getEvent } from './data';
import { getSetting, setSetting, getSecret, regimentName } from './settings';
import { guestPath } from './links';
import { fmtDate, fmtHrs, fmtDateHrs } from './util';
import { xbConfig, xbSendTemplate, xbStatus, XbError } from './xpressbot';
import { buttonPath } from './quickopen';

export const KINDS = {
  invite: { label: 'Invitation', setting: 'xb_tpl_invite', defaultName: 'kainlee_invitation' },
  reminder: { label: 'Reply reminder', setting: 'xb_tpl_reminder', defaultName: 'kainlee_reminder' },
  confirm: { label: 'Reply confirmation', setting: 'xb_tpl_confirm', defaultName: 'kainlee_confirm' },
  eventday: { label: 'Event-day pass', setting: 'xb_tpl_eventday', defaultName: 'kainlee_eventday' },
};

// The templates to create in Xpressbot (category Utility). Body variables are filled in order
// (body1, body2 …), the header variable with `header`, link buttons with button1, button2.
// No PIN in these messages: Meta treats a PIN as a login code and rejects the template; the
// "Open my invitation" button opens the invitation directly instead (see lib/quickopen.js).
const FOOTER = 'Forefirst · Fourth Bn The First Gorkha Rifles';
const OPEN = (text) => ({ text, url: 'https://forefirst.org/i/{{1}}', sample: 'rgt/9233002887?k=Ab3dE9xQ7mK2pL4w' });
export const TEMPLATE_TEXT = {
  invite: {
    header: { type: 'Image', note: 'the guest\'s invitation card (attached automatically)' },
    body: 'Dear *{{1}}*,\n\nYour invitation from *{{2}}* for *{{3}}* is ready.\n\n*When:* at {{4}} on {{5}}\n\nPlease confirm your attendance and add your family members using the button below by *{{6}}*.\n\nThank you.',
    vars: [['Guest name with rank', 'Col R K Thapa'], ['Host (unit)', '4/1 GR'], ['Event', 'Regimental Get Together'], ['Time', '2000 hrs'], ['Date', '21 Nov 2026'], ['Reply by', '15 Nov 2026 at 2000 hrs']],
    footer: FOOTER,
    buttons: [OPEN('Open my invitation')],
  },
  reminder: {
    header: { type: 'Text', text: 'Reminder: {{1}}', sample: 'Regimental Get Together' },
    body: 'Dear *{{1}}*,\n\nA gentle reminder to reply to your invitation for *{{2}}* by *{{3}}*.\n\nPlease tap *Open my invitation* below.\n\nThank you.',
    vars: [['Guest name with rank', 'Col R K Thapa'], ['Event', 'Regimental Get Together'], ['Reply by', '15 Nov 2026 at 2000 hrs']],
    footer: FOOTER,
    buttons: [OPEN('Open my invitation')],
  },
  confirm: {
    header: { type: 'Text', text: 'Reply received' },
    body: 'Dear *{{1}}*,\n\nThank you for your reply for *{{2}}*.\n\n*We have noted:* {{3}}\n\nYou can change your reply until *{{4}}* using the button below.\n\nThank you.',
    vars: [['Guest name with rank', 'Col R K Thapa'], ['Event', 'Regimental Get Together'], ['What was noted', 'Attending, 3 persons'], ['Reply by', '15 Nov 2026 at 2000 hrs']],
    footer: FOOTER,
    buttons: [OPEN('View or change reply')],
  },
  eventday: {
    header: { type: 'Text', text: 'Today: {{1}}', sample: 'Barakhana' },
    body: 'Dear *{{1}}*,\n\nWe look forward to welcoming you today.\n\n*Time:* {{2}}\n*Venue:* {{3}}\n\nPlease show your entry QR at the gate.\n\nThank you.',
    vars: [['Guest name with rank', 'Col R K Thapa'], ['Time', '1230 hrs'], ['Venue', "Officers' Mess"]],
    footer: FOOTER,
    buttons: [OPEN('Show entry pass'), { text: 'Get directions', url: 'https://forefirst.org/d/{{1}}', sample: 'rgt' }],
  },
};

const IST = 330 * 60000;
const istDay = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);
const istHour = (d = new Date()) => new Date(d.getTime() + IST).getUTCHours();

export async function siteBase() {
  return (process.env.SITE_URL || (await getSetting('xb_site')) || '').replace(/\/$/, '');
}

/** Card image URL that WhatsApp can fetch without the PIN, valid for 7 days. */
export async function signedCardUrl(base, token, days = 7) {
  const e = Math.floor(Date.now() / 1000) + days * 86400;
  return `${base}/i/${token}/card.png?e=${e}&s=${await cardSig(token, e)}`;
}
export async function cardSig(token, e) {
  return crypto.createHmac('sha256', await getSecret()).update(`card:${token}:${e}`).digest('base64url').slice(0, 32);
}
export async function cardSigOk(token, e, s) {
  if (!e || !s || Number(e) < Date.now() / 1000) return false;
  const want = Buffer.from(await cardSig(token, Number(e)));
  const got = Buffer.from(String(s));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function noted(inv, fns) {
  if (inv.rsvp_status === 'declined') return 'Regret, not attending';
  if (inv.rsvp_status !== 'attending') return 'No reply yet';
  const parts = [];
  for (const f of fns) {
    const n = inv.members.filter((m) => m.functions?.[f.id]?.attending && !m.is_walkin).length;
    if (n) parts.push(`${f.name} ${n}`);
  }
  const people = inv.members.filter((m) => !m.is_walkin && Object.values(m.functions || {}).some((x) => x.attending)).length;
  return `Attending, ${people} ${people === 1 ? 'person' : 'persons'}${parts.length > 1 ? ` (${parts.join(', ')})` : ''}`;
}

/** Load what a message needs: invitation + guest + members, event, links. */
async function loadContext(invitationId) {
  const k = await db();
  const inv = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.id', invitationId)
    .select('i.*', 'p.rank', 'p.name', 'p.mobile', 'p.lang').first();
  if (!inv) return null;
  const ev = await getEvent(inv.event_id);
  const members = await k('members').where({ invitation_id: inv.id });
  const marks = members.length ? await k('member_functions').whereIn('member_id', members.map((m) => m.id)) : [];
  for (const m of members) {
    m.functions = {};
    for (const x of marks) if (x.member_id === m.id) m.functions[x.function_id] = { attending: !!x.attending, attendance: x.attendance };
  }
  inv.members = members;
  const base = await siteBase();
  return { inv, ev, base, link: `${base}${guestPath(ev.code, inv)}`, regiment: await regimentName() };
}

/** What fills a template: { header, vars (body, in order), buttons (URL suffixes, in order) }. */
export async function buildVars(kind, { inv, ev, regiment }, params = {}) {
  const who = [inv.rank, inv.name].filter(Boolean).join(' ');
  const fns = [...ev.functions].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const firstAt = fns[0]?.starts_at || ev.starts_at;
  const deadline = ev.rsvp_deadline ? fmtDateHrs(ev.rsvp_deadline) : 'the earliest';
  const open = await buttonPath(ev.code, inv);
  if (kind === 'invite') {
    return { vars: [who, ev.card_unit || regiment, ev.name, firstAt ? fmtHrs(firstAt) : 'a time to be announced', firstAt ? fmtDate(firstAt) : 'a date to be announced', deadline], buttons: [open] };
  }
  if (kind === 'reminder') return { header: ev.name, vars: [who, ev.name, deadline], buttons: [open] };
  if (kind === 'confirm') return { vars: [who, ev.name, noted(inv, fns), deadline], buttons: [open] };
  if (kind === 'eventday') {
    const f = fns.find((x) => x.id === Number(params.fn)) || null;
    const at = f?.starts_at || ev.starts_at;
    return { header: f?.name || ev.name, vars: [who, at ? fmtHrs(at) : '-', f?.venue || ev.venue || '-'], buttons: [open, ev.code || '-'] };
  }
  throw new Error(`Unknown message kind ${kind}`);
}

/** Pick the template language: the guest's own if that template exists in it, else English. */
async function pickLanguage(template, lang) {
  let list = [];
  try { list = JSON.parse((await getSetting('xb_templates')) || '[]'); } catch {}
  const langs = list.filter((t) => t.name === template).map((t) => t.language);
  if (!langs.length) return undefined; // let Xpressbot resolve it
  const want = { en: ['en', 'en_US', 'en_GB'], hi: ['hi'], ne: ['ne'] }[lang] || [];
  return want.find((l) => langs.includes(l)) || ['en', 'en_US', 'en_GB'].find((l) => langs.includes(l)) || langs[0];
}

export async function templateFor(kind) {
  return (await getSetting(KINDS[kind].setting)) || KINDS[kind].defaultName;
}

// ---------------------------------------------------------------- queue

/** Queue a message. Returns true if added (false if the same message is already queued/sent). */
export async function enqueue({ kind, invitationId, eventId, dedupe, params = {}, sendAfter = new Date(), userId = null }) {
  const k = await db();
  try {
    await k('wa_messages').insert({ kind, invitation_id: invitationId, event_id: eventId, dedupe, params: JSON.stringify(params), send_after: sendAfter, created_by: userId, created_at: new Date() });
    kick();
    return true;
  } catch (e) {
    if (/duplicate|unique/i.test(String(e.message))) return false;
    throw e;
  }
}

/** Reply confirmation, sent 90 s after the last change so several quick edits make one message. */
export async function queueConfirmation(invitationId) {
  const k = await db();
  const inv = await k('invitations as i').join('events as e', 'e.id', 'i.event_id').where('i.id', invitationId).select('i.id', 'i.event_id', 'e.wa_confirm').first();
  if (!inv?.wa_confirm || !(await xbConfig()).enabled) return false;
  const when = new Date(Date.now() + 90000);
  const n = await k('wa_messages').where({ invitation_id: invitationId, kind: 'confirm', status: 'queued' }).update({ send_after: when });
  if (n) return true;
  return enqueue({ kind: 'confirm', invitationId, eventId: inv.event_id, dedupe: `conf:${invitationId}:${Date.now()}`, sendAfter: when });
}

/** Bulk: invitations to those not yet sent, or reminders to those who haven't replied. */
export async function queueBulk({ eventId, kind, ids = null, userId }) {
  const k = await db();
  const q = k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.event_id', eventId).where('i.is_walkin', false).select('i.id', 'p.mobile');
  if (ids?.length) q.whereIn('i.id', ids);
  else if (kind === 'invite') q.whereNull('i.invite_sent_at');
  else if (kind === 'reminder') q.where('i.rsvp_status', 'pending').whereNotNull('i.invite_sent_at');
  const rows = await q;
  const busy = new Set((await k('wa_messages').where({ event_id: eventId, kind }).whereIn('status', ['queued', 'sending']).select('invitation_id')).map((r) => r.invitation_id));
  let added = 0, noMobile = 0, already = 0;
  const now = Date.now();
  for (const r of rows) {
    if (!r.mobile) { noMobile++; continue; }
    if (busy.has(r.id)) { already++; continue; }
    if (await enqueue({ kind, invitationId: r.id, eventId, dedupe: `${kind}:${r.id}:${now}`, userId })) added++;
  }
  return { added, noMobile, already, total: rows.length };
}

// ---------------------------------------------------------------- sending

async function sendOne(msg) {
  const k = await db();
  const ctx = await loadContext(msg.invitation_id);
  if (!ctx) return k('wa_messages').where({ id: msg.id }).update({ status: 'skipped', error: 'Guest no longer exists.' });
  if (!ctx.inv.mobile) return k('wa_messages').where({ id: msg.id }).update({ status: 'skipped', error: 'No mobile number.' });
  if (msg.kind === 'reminder' && ctx.inv.rsvp_status !== 'pending') return k('wa_messages').where({ id: msg.id }).update({ status: 'skipped', error: 'Already replied.' });
  if (!ctx.base) return k('wa_messages').where({ id: msg.id }).update({ status: 'failed', error: 'Site address unknown: open Settings › WhatsApp automation and press Save once.' });
  let params = {};
  try { params = JSON.parse(msg.params || '{}'); } catch {}
  const template = await templateFor(msg.kind);
  const filled = await buildVars(msg.kind, ctx, params);
  const withImage = msg.kind === 'invite' && (await getSetting('xb_invite_image')) !== '0';
  const mediaUrl = withImage ? await signedCardUrl(ctx.base, ctx.inv.token) : undefined;
  const language = await pickLanguage(template, ctx.inv.lang);
  const useButtons = (await getSetting('xb_buttons')) !== '0';
  const base = { to: ctx.inv.mobile, template, vars: JSON.stringify(filled) };
  try {
    const r = await xbSendTemplate({ to: ctx.inv.mobile, template, language, vars: filled.vars, header: filled.header, buttons: useButtons ? filled.buttons : [], buttonParam: (await getSetting('xb_button_param')) || 'button', mediaUrl });
    await k('wa_messages').where({ id: msg.id }).update({ ...base, status: 'sent', wamid: r.wamid, delivery: 'sent', sent_at: new Date(), error: null });
    if (msg.kind === 'invite') {
      await k('invitations').where({ id: ctx.inv.id }).update({ invite_sent_at: new Date(), invite_sent_by: msg.created_by, invite_send_count: (ctx.inv.invite_send_count || 0) + 1 });
    } else if (msg.kind === 'reminder') {
      await k('invitations').where({ id: ctx.inv.id }).update({ reminder_sent_at: new Date(), reminder_sent_by: msg.created_by });
    }
  } catch (e) {
    const retry = e instanceof XbError && e.retry && msg.attempts < 4;
    await k('wa_messages').where({ id: msg.id }).update({
      ...base,
      status: retry ? 'queued' : 'failed',
      error: String(e.message || e).slice(0, 500),
      send_after: new Date(Date.now() + (e.status === 429 ? 60000 : 120000)),
    });
  }
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const cfg = await xbConfig();
    if (!cfg.enabled) return;
    const k = await db();
    // messages stuck in "sending" after a restart go back to the queue
    await k('wa_messages').where({ status: 'sending' }).where('send_after', '<', new Date(Date.now() - 5 * 60000)).update({ status: 'queued' });
    const next = await k('wa_messages').where({ status: 'queued' }).where('send_after', '<=', new Date()).orderBy('id').first();
    if (!next) return;
    const got = await k('wa_messages').where({ id: next.id, status: 'queued' }).update({ status: 'sending', attempts: next.attempts + 1, send_after: new Date() });
    if (!got) return;
    await sendOne({ ...next, attempts: next.attempts + 1 });
  } catch (e) {
    console.error('[wa] send loop', e.message);
  } finally { busy = false; }
}

// ---------------------------------------------------------------- schedule

/** Queue automatic reminders and event-day passes that are due. Safe to run often. */
export async function schedule(now = new Date()) {
  const cfg = await xbConfig();
  if (!cfg.enabled) return { skipped: true };
  const k = await db();
  const out = { reminders: 0, eventday: 0 };
  const hour = istHour(now);
  const events = await k('events').where({ status: 'active' }).where((w) => w.where('wa_reminders', true).orWhere('wa_eventday', true));
  for (const ev of events) {
    // reply reminders: 3 days and 1 day before the deadline, 0900-2000 hrs IST
    if (ev.wa_reminders && ev.rsvp_deadline && hour >= 9 && hour < 20) {
      const dl = new Date(ev.rsvp_deadline).getTime();
      const left = dl - now.getTime();
      const stage = left <= 0 ? null : left <= 86400000 ? 1 : left <= 3 * 86400000 ? 3 : null;
      if (stage) {
        const rows = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id')
          .where({ 'i.event_id': ev.id, 'i.rsvp_status': 'pending', 'i.is_walkin': false }).whereNotNull('i.invite_sent_at').whereNotNull('p.mobile').select('i.id');
        for (const r of rows) if (await enqueue({ kind: 'reminder', invitationId: r.id, eventId: ev.id, dedupe: `rem${stage}:${r.id}` })) out.reminders++;
      }
    }
    // event-day pass: from 0700 hrs IST on each function day (or the event's own date)
    if (ev.wa_eventday && hour >= 7 && hour < 20) {
      const full = await getEvent(ev.id);
      const today = istDay(now);
      const todays = full.functions.filter((f) => istDay(f.starts_at) === today).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      const eventToday = !full.functions.length && ev.starts_at && istDay(ev.starts_at) === today;
      if (todays.length || eventToday) {
        const rows = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id')
          .where({ 'i.event_id': ev.id, 'i.rsvp_status': 'attending', 'i.is_walkin': false }).whereNotNull('p.mobile').select('i.id');
        for (const r of rows) {
          let fn = todays[0]?.id || null;
          if (todays.length > 1) {
            // the first of today's functions this family is coming to
            const mf = await k('member_functions as mf').join('members as m', 'm.id', 'mf.member_id')
              .where({ 'm.invitation_id': r.id, 'mf.attending': true }).whereIn('mf.function_id', todays.map((f) => f.id)).select('mf.function_id');
            const set = new Set(mf.map((x) => x.function_id));
            fn = todays.find((f) => set.has(f.id))?.id || null;
            if (!fn) continue;
          } else if (todays.length === 1) {
            const n = await k('member_functions as mf').join('members as m', 'm.id', 'mf.member_id').where({ 'm.invitation_id': r.id, 'mf.attending': true, 'mf.function_id': fn }).count({ n: '*' }).first();
            if (!Number(n.n)) continue;
          }
          if (await enqueue({ kind: 'eventday', invitationId: r.id, eventId: ev.id, dedupe: `day:${today}:${r.id}`, params: { fn } })) out.eventday++;
        }
      }
    }
  }
  return out;
}

/** Ask Xpressbot for delivery status (delivered / read / failed) of recent messages. */
async function refreshStatus() {
  const cfg = await xbConfig();
  if (!cfg.enabled) return;
  const k = await db();
  const rows = await k('wa_messages').where({ status: 'sent' }).whereNotNull('wamid').whereNotIn('delivery', ['read', 'failed'])
    .where('sent_at', '>', new Date(Date.now() - 3 * 86400000))
    .where((w) => w.whereNull('checked_at').orWhere('checked_at', '<', new Date(Date.now() - 10 * 60000)))
    .orderBy('checked_at').limit(40);
  for (const r of rows) {
    try {
      const d = await xbStatus(r.wamid, cfg);
      const st = String(d?.status || d?.data?.status || '').toLowerCase();
      await k('wa_messages').where({ id: r.id }).update({ delivery: ['sent', 'delivered', 'read', 'failed'].includes(st) ? st : r.delivery, checked_at: new Date(), ...(st === 'failed' && d?.error ? { error: String(d.error).slice(0, 500) } : {}) });
    } catch (e) {
      await k('wa_messages').where({ id: r.id }).update({ checked_at: new Date() });
      if (e.status === 429) break;
    }
  }
}

// ---------------------------------------------------------------- background loop

const G = globalThis;
function kick() { if (G.__klWa) setTimeout(tick, 50); }

export function startWhatsAppWorker() {
  if (G.__klWa) return;
  G.__klWa = {
    send: setInterval(tick, 3500),
    plan: setInterval(() => schedule().catch((e) => console.error('[wa] schedule', e.message)), 5 * 60000),
    status: setInterval(() => refreshStatus().catch((e) => console.error('[wa] status', e.message)), 10 * 60000),
  };
  setTimeout(() => schedule().catch(() => {}), 15000);
  console.log('[wa] WhatsApp automation worker started');
}

export async function rememberSite(base) {
  if (base && (await getSetting('xb_site')) !== base) await setSetting('xb_site', base);
}
