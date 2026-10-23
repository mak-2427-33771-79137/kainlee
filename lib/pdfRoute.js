import { db } from './db';
import { getEvent, displayName } from './data';
import { invitationPdf } from './pdf';
import { regimentName } from './settings';
import { linkFor, canSeeCard } from './guestLink';

// The PDF card carries the entry QR: guests must open their invitation with the PIN first.
export async function pdfResponse(token) {
  const r = await linkFor(token);
  if (!r) return new Response('This invitation link is not valid.', { status: 404 });
  if (!(await canSeeCard(r))) return new Response(null, { status: 303, headers: { location: `${r.path}?next=pdf`, 'cache-control': 'no-store' } });
  const k = await db();
  const [invitee, event, regiment] = await Promise.all([k('invitees').where({ id: r.invitee_id }).first(), getEvent(r.event_id), regimentName()]);
  const pdf = await invitationPdf({ event, functions: event.functions, invitee, regiment, checkinCode: r.checkin_code });
  const name = `Invitation-${displayName(invitee)}`.replace(/[^A-Za-z0-9-]+/g, '-');
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}.pdf"`, 'cache-control': 'private, no-store' } });
}
