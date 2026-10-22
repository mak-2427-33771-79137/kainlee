import { db } from '@/lib/db';
import { getEvent, displayName } from '@/lib/data';
import { invitationPdf } from '@/lib/pdf';
import { regimentName } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// The link itself is the secret (128-bit token), like the guest page link.
export async function GET(req, { params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) return new Response('Not found', { status: 404 });
  const k = await db();
  const inv = await k('invitations').where({ token }).first();
  if (!inv) return new Response('This invitation link is not valid.', { status: 404 });
  const invitee = await k('invitees').where({ id: inv.invitee_id }).first();
  const event = await getEvent(inv.event_id);
  const pdf = await invitationPdf({ event, functions: event.functions, invitee, regiment: await regimentName(), checkinCode: inv.checkin_code });
  const name = `Invitation-${displayName(invitee)}`.replace(/[^A-Za-z0-9-]+/g, '-');
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}.pdf"`, 'cache-control': 'private, max-age=300' } });
}
