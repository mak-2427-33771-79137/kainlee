import { notFound, redirect } from 'next/navigation';
import Frame from '@/components/Frame';
import Icon from '@/components/Icon';
import { db } from '@/lib/db';
import { getEvent, displayName } from '@/lib/data';
import { cardHtmlFor } from '@/lib/guest';
import { linkFor, canSeeCard } from '@/lib/guestLink';
import CardDownload from '@/app/i/[token]/card/CardDownload';

// The guest's card (image for the built-in design, HTML for custom cards) with PDF download. Needs the PIN.
export default async function CardScreen({ token }) {
  const r = await linkFor(token);
  if (!r) notFound();
  if (!(await canSeeCard(r))) redirect(`${r.path}?next=card`);
  const k = await db();
  const [invitee, event] = await Promise.all([k('invitees').where({ id: r.invitee_id }).first(), getEvent(r.event_id)]);
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
            <a className="btn pri" href={r.path}><Icon n="check" />Open my invitation &amp; RSVP</a>
            <a className="btn" href={`${r.path}/invitation.pdf`} target="_blank" rel="noopener"><Icon n="dl" />Download PDF</a>
            <a className="btn" href={`/i/${token}/card.png`} download={`Invitation-${name.replace(/[^A-Za-z0-9]+/g, '-')}.png`}><Icon n="image" />Save image</a>
          </div>
        </main>
      </Frame>
    );
  }
  const html = await cardHtmlFor(event, invitee, r.checkin_code);
  return (
    <Frame>
      <main className="gwrap" style={{ maxWidth: 1000 }}>
        <CardDownload html={html} name={name} path={r.path} />
      </main>
    </Frame>
  );
}
