import { db } from './db';
import { getEvent } from './data';
import { regimentName } from './settings';
import { cardImage } from './cardImage';
import { linkFor, canSeeCard } from './guestLink';
import { eventByCode } from './links';
import { cardSigOk } from './wa';

// /i/<token>/card.png: the guest's personal card with entry QR (needs the PIN or an admin login).
// A signed link (?e=expiry&s=signature) lets WhatsApp fetch the card for an Xpressbot message.
export async function cardImageResponse(token, sp = null) {
  const r = await linkFor(token);
  if (!r) return new Response('Not found', { status: 404 });
  const signed = sp && (await cardSigOk(token, sp.get('e'), sp.get('s')));
  if (!signed && !(await canSeeCard(r))) return new Response('Open your invitation with the PIN first.', { status: 403 });
  const k = await db();
  const [invitee, event, regiment] = await Promise.all([k('invitees').where({ id: r.invitee_id }).first(), getEvent(r.event_id), regimentName()]);
  const img = await cardImage({ event, functions: event.functions, invitee, regiment, checkinCode: r.checkin_code });
  return png(await img.arrayBuffer(), 'private, max-age=300');
}

// /i/<event code or token>/preview.png: link-preview image for WhatsApp. The event's card with no
// guest name and no QR, because readable links can be guessed from a phone number.
export async function previewImageResponse(key) {
  let event = null;
  const r = await linkFor(key);
  if (r) event = await getEvent(r.event_id);
  else { const e = await eventByCode(key); if (e) event = await getEvent(e.id); }
  if (!event) return new Response('Not found', { status: 404 });
  const img = await cardImage({ event, functions: event.functions, invitee: { rank: '', name: 'you and your family' }, regiment: await regimentName(), preview: true });
  return png(await img.arrayBuffer(), 'public, max-age=3600');
}

function png(body, cache) {
  return new Response(body, { headers: { 'content-type': 'image/png', 'cache-control': cache, 'content-disposition': 'inline; filename="Invitation.png"' } });
}
