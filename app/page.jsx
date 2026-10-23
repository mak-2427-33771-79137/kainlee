import Link from 'next/link';
import Frame from '@/components/Frame';
import March from '@/components/March';
import { regimentName, getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const name = await regimentName();
  const credit = (await getSetting('credit_text')) ?? 'Crafted with pride by Mak · makjal.com';
  return (
    <Frame>
      <main style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '32px 18px', textAlign: 'center' }}>
        <img className="coin" src="/api/logo/512" alt={`${name} crest`} width={140} height={140} />
        <div>
          <h1 className="go" style={{ fontSize: 'clamp(44px,9vw,72px)', textShadow: '0 4px 18px rgba(0,0,0,.4)' }}>{name}</h1>
          <p className="go" style={{ fontSize: 22, color: 'var(--accent)', margin: '4px 0 0' }}>Invitations &amp; Attendance</p>
        </div>
        <div style={{ width: 'min(100%,560px)' }}><March squads={2} men={4} height={46} duration={16} width="600px" /></div>
        <p className="mu" style={{ maxWidth: 420, margin: 0 }}>Guests: please open the personal link sent to you on WhatsApp. It has your invitation, RSVP and entry pass.</p>
        <Link className="btn" href="/login">Organiser login</Link>
        <p className="credit">{credit}</p>
      </main>
    </Frame>
  );
}
