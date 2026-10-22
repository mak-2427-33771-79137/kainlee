import { notFound } from 'next/navigation';
import Frame from '@/components/Frame';
import { db } from '@/lib/db';
import { getEvent, displayName } from '@/lib/data';
import { cardHtmlFor } from '@/lib/guest';
import CardDownload from './CardDownload';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitation card' };

// The custom (HTML) invitation card, viewable and downloadable as PDF. The link is the secret.
export default async function CardPage({ params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) notFound();
  const k = await db();
  const inv = await k('invitations').where({ token }).first();
  if (!inv) notFound();
  const invitee = await k('invitees').where({ id: inv.invitee_id }).first();
  const event = await getEvent(inv.event_id);
  const html = await cardHtmlFor(event, invitee, inv.checkin_code);
  return (
    <Frame>
      <main className="gwrap" style={{ maxWidth: 1000 }}>
        <CardDownload html={html} name={displayName(invitee)} token={token} />
      </main>
    </Frame>
  );
}
