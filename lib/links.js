// Readable guest links: /i/<event code>/<mobile>  (e.g. /i/rgt26/9233002887).
// When family members share one phone, later invitations get -2, -3 … on the end.
// Guests without a mobile number keep the random link /i/<token>.
import { db } from './db';
import { mobileSlugBase } from './schema';

export { mobileSlugBase };

export function guestPath(eventCode, inv) {
  return inv.slug && eventCode ? `/i/${eventCode}/${inv.slug}` : `/i/${inv.token}`;
}

/** Give an invitation its mobile slug (unique within the event). */
export async function assignSlug(trx, invId, eventId, mobile) {
  const base = mobileSlugBase(mobile);
  if (!base) { await trx('invitations').where({ id: invId }).update({ slug: null }); return null; }
  const taken = new Set((await trx('invitations').where({ event_id: eventId }).whereNot({ id: invId })
    .andWhere((q) => q.where('slug', base).orWhere('slug', 'like', `${base}-%`)).select('slug')).map((r) => r.slug));
  let slug = base; let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  await trx('invitations').where({ id: invId }).update({ slug });
  return slug;
}

/** Normalise what a person typed after /i/<code>/ : +91 92330 02887 → 9233002887 */
export function cleanSlug(s) {
  const m = String(s || '').toLowerCase().match(/^\+?([\d\s-]*?\d)(-(\d{1,2}))?$/);
  if (!m) return null;
  let d = m[1].replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return m[3] ? `${d}-${m[3]}` : d;
}

/** /i/<code>/<mobile> → the invitation token, or null */
export async function tokenFor(code, mobile) {
  const slug = cleanSlug(decodeURIComponent(mobile || ''));
  if (!slug || !/^[a-z0-9-]{1,24}$/i.test(code || '')) return null;
  const k = await db();
  const row = await k('invitations as i').join('events as e', 'e.id', 'i.event_id')
    .whereRaw('LOWER(e.code) = ?', [String(code).toLowerCase()]).andWhere('i.slug', slug).select('i.token').first();
  return row?.token || null;
}

/** Event for a code (used for the shared link-preview image). */
export async function eventByCode(code) {
  if (!/^[a-z0-9-]{1,24}$/i.test(code || '')) return null;
  const k = await db();
  return k('events').whereRaw('LOWER(code) = ?', [String(code).toLowerCase()]).first();
}

export const EVENT_CODE_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
