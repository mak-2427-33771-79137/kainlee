import { db } from './db';
import { getEvent } from './data';
import { regimentName } from './settings';
import { cardImage } from './cardImage';

// Shared handler for /i/<token>/card.png (with entry QR) and /i/<token>/preview.png (link preview).
// The link itself is the secret (128-bit token), like the guest page and PDF links.
export async function cardImageResponse(token, preview) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) return new Response('Not found', { status: 404 });
  const k = await db();
  const inv = await k('invitations').where({ token }).first();
  if (!inv) return new Response('Not found', { status: 404 });
  const [invitee, event, regiment] = await Promise.all([
    k('invitees').where({ id: inv.invitee_id }).first(),
    getEvent(inv.event_id),
    regimentName(),
  ]);
  const img = await cardImage({ event, functions: event.functions, invitee, regiment, checkinCode: inv.checkin_code, preview });
  const body = await img.arrayBuffer();
  return new Response(body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': preview ? 'public, max-age=3600' : 'private, max-age=300',
      'content-disposition': 'inline; filename="Invitation.png"',
    },
  });
}
