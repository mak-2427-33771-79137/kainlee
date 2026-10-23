// Guest-side session and the data a guest's page needs.
import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { db } from './db';
import { sign, verify, cookieOpts } from './auth';
import { getEvent, loadInvitation, displayName } from './data';
import { regimentName, getSetting } from './settings';
import { cardTemplateFor, renderCard, DEFAULT_CARD_HTML } from './cards';
import { roomsNeeded } from './stats';
import { dateToIstInput } from './util';

const cookieName = (token) => `kl_g_${token.slice(0, 10)}`;

export async function guestAuthed(token) {
  const jar = await cookies();
  const p = await verify(jar.get(cookieName(token))?.value);
  return p && p.t === token ? p.inv : null;
}
export async function startGuestSession(token, invId) {
  const jar = await cookies();
  jar.set(cookieName(token), await sign({ inv: invId, t: token }, 45 * 86400), cookieOpts(45 * 86400));
}
export async function endGuestSession(token) {
  const jar = await cookies();
  jar.delete(cookieName(token));
}

export function deadlinePassed(ev) {
  return !!(ev.rsvp_deadline && new Date(ev.rsvp_deadline) < new Date());
}

export async function qrSvg(code) {
  return QRCode.toString(`KLN-${code}`, { type: 'svg', margin: 1, color: { dark: '#00572D', light: '#FFFFFF' } });
}
export async function qrDataUrl(code) {
  return QRCode.toDataURL(`KLN-${code}`, { margin: 1, width: 300, color: { dark: '#00572D', light: '#FFFFFF' } });
}

export async function cardHtmlFor(event, invitee, checkinCode, base = '') {
  const k = await db();
  const series = event.series_id ? await k('series').where({ id: event.series_id }).first() : null;
  const tpl = cardTemplateFor(event, series);
  return renderCard(tpl.html || DEFAULT_CARD_HTML, {
    event, functions: event.functions, invitee, regiment: await regimentName(),
    crestUrl: `${base}/api/logo/512`, qrUrl: checkinCode ? await qrDataUrl(checkinCode) : '',
  });
}

/** Everything the guest page renders. Only call after PIN check. */
export async function guestView(token) {
  const inv = await loadInvitation({ token });
  if (!inv) return null;
  const event = await getEvent(inv.event_id);
  const k = await db();
  const rooms = await k('room_allotments as a').join('rooms as r', 'r.id', 'a.room_id')
    .where('a.invitation_id', inv.id).select('r.name', 'r.location');
  const handler = inv.handler_id ? await k('users').where({ id: inv.handler_id }).first() : null;
  const present = {};
  for (const m of inv.members) for (const [fid, mf] of Object.entries(m.functions)) {
    if (mf.attendance === 'present') present[fid] = (present[fid] || 0) + 1;
  }
  return {
    token,
    regiment: await regimentName(),
    credit: (await getSetting('credit_text')) ?? 'Crafted with pride by Mak · makjal.com',
    warCry: (await getSetting('war_cry')) ?? 'Jai Mahakali, Ayo Gorkhali!',
    event: {
      id: event.id, name: event.name, venue: event.venue, map_url: event.map_url, starts_at: event.starts_at,
      rsvp_deadline: event.rsvp_deadline, closed: deadlinePassed(event) || event.status === 'closed',
      card_note: event.card_note, default_extra_cap: event.default_extra_cap, card_mode: event.card_mode,
      guestroom: !!event.guestroom_enabled,
      dietNotes: !!event.diet_notes_enabled,
      functions: event.functions.map((f) => ({ id: f.id, name: f.name, starts_at: f.starts_at, venue: f.venue, map_url: f.map_url, dress: f.dress })),
    },
    invitee: { name: displayName(inv.invitee), rank: inv.invitee.rank, plainName: inv.invitee.name, category: inv.invitee.category, lang: inv.invitee.lang },
    invitation: {
      rsvp_status: inv.rsvp_status, extra_cap: inv.extra_cap, checkin_code: inv.checkin_code,
      guestroom_eligible: !!inv.guestroom_eligible, guestroom_required: !!inv.guestroom_required, rooms_required: inv.rooms_required,
      eta: dateToIstInput(inv.guestroom_eta), etd: dateToIstInput(inv.guestroom_etd),
      rooms_allotted: rooms, rooms_needed: roomsNeeded(inv),
      note: inv.guestroom_note_visible ? inv.guestroom_note : null,
      handler: handler ? { name: handler.name, phone: handler.phone } : null,
    },
    members: inv.members.map((m) => ({
      id: m.id, name: m.name, relation: m.relation, age_group: m.age_group, meal: m.meal, meal_note: m.meal_note || '',
      is_walkin: !!m.is_walkin,
      attending: Object.entries(m.functions).filter(([, v]) => v.attending).map(([fid]) => Number(fid)),
    })),
    present,
    cardHtml: await cardHtmlFor(event, inv.invitee, inv.checkin_code),
    qrSvg: await qrSvg(inv.checkin_code),
  };
}
