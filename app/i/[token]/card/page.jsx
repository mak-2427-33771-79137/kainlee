import { notFound } from 'next/navigation';
import Frame from '@/components/Frame';
import Icon from '@/components/Icon';
import { db } from '@/lib/db';
import { getEvent, displayName } from '@/lib/data';
import { cardHtmlFor } from '@/lib/guest';
import { regimentName } from '@/lib/settings';
import { requestBase, cardPreviewMeta } from '@/lib/page';
import CardDownload from './CardDownload';

export const dynamic = 'force-dynamic';

async function find(token) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) return null;
  const k = await db();
  const inv = await k('invitations').where({ token }).first();
  if (!inv) return null;
  const [invitee, event] = await Promise.all([k('invitees').where({ id: inv.invitee_id }).first(), getEvent(inv.event_id)]);
  return { inv, invitee, event };
}

export async function generateMetadata({ params }) {
  const { token } = await params;
  const r = await find(token);
  if (!r) return { title: 'Invitation card' };
  const [reg, base] = await Promise.all([regimentName(), requestBase()]);
  return {
    title: `Invitation card · ${displayName(r.invitee)}`,
    ...cardPreviewMeta(base, token, `${reg} · Invitation for ${displayName(r.invitee)}`, r.event.name),
  };
}

// The guest's invitation card: image (built-in design) or custom HTML card, with PDF download.
// The link is the secret.
export default async function CardPage({ params }) {
  const { token } = await params;
  const r = await find(token);
  if (!r) notFound();
  const { inv, invitee, event } = r;
  const name = displayName(invitee);
  if (event.card_mode === 'builtin') {
    return (
      <Frame>
        <main className="gwrap" style={{ maxWidth: 1000 }}>
          <div className="face" style={{ position: 'relative', boxShadow: '0 26px 34px -10px rgba(0,0,0,.45)' }}>
            <img src={`/i/${token}/card.png`} alt={`Invitation card for ${name}`} width={1920} height={1080} style={{ display: 'block', width: '100%', height: 'auto' }} fetchPriority="high" />
            <div className="gloss" />
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <a className="btn pri" href={`/i/${token}`}><Icon n="check" />Open my invitation &amp; RSVP</a>
            <a className="btn" href={`/i/${token}/invitation.pdf`} target="_blank" rel="noopener"><Icon n="dl" />Download PDF</a>
            <a className="btn" href={`/i/${token}/card.png`} download={`Invitation-${name.replace(/[^A-Za-z0-9]+/g, '-')}.png`}><Icon n="image" />Save image</a>
          </div>
        </main>
      </Frame>
    );
  }
  const html = await cardHtmlFor(event, invitee, inv.checkin_code);
  return (
    <Frame>
      <main className="gwrap" style={{ maxWidth: 1000 }}>
        <CardDownload html={html} name={name} token={token} />
      </main>
    </Frame>
  );
}
