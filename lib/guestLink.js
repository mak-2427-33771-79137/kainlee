// Resolve a guest's invitation (by token) with its public path, and decide who may see the card.
import { db } from './db';
import { guestAuthed } from './guest';
import { getAdmin } from './auth';
import { guestPath } from './links';

export async function linkFor(token) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(token || '')) return null;
  const k = await db();
  const r = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').join('events as e', 'e.id', 'i.event_id')
    .where('i.token', token)
    .select('i.id', 'i.token', 'i.slug', 'i.event_id', 'i.invitee_id', 'i.checkin_code', 'p.lang', 'e.code', 'e.name as event', 'e.card_mode')
    .first();
  if (!r) return null;
  return { ...r, path: guestPath(r.code, r) };
}

// The card shows the entry QR, so it needs the guest's PIN (or an admin login).
export async function canSeeCard(r) {
  if ((await guestAuthed(r.token)) === r.id) return true;
  return !!(await getAdmin());
}
