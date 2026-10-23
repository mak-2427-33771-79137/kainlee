import Frame from '@/components/Frame';
import { regimentName, getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy policy', robots: { index: true, follow: false } };

// Public privacy policy (needed for the App Store listing).
export default async function Privacy() {
  const reg = await regimentName();
  const credit = (await getSetting('credit_text')) ?? 'Crafted with pride by Mak · makjal.com';
  return (
    <Frame>
      <main className="gwrap" style={{ maxWidth: 760 }}>
        <section className="card3 stack" style={{ padding: '22px 18px' }}>
          <h1 className="go" style={{ fontSize: 34 }}>Privacy policy</h1>
          <p className="mu" style={{ margin: 0 }}>{reg} Invitations · website and iOS app (Kainlee) · last updated 23 Oct 2026</p>
          <h2 className="go" style={{ fontSize: 22 }}>What this service is</h2>
          <p style={{ margin: 0 }}>{reg} Invitations is used by the organisers of {reg} regimental events to send invitations, collect replies (RSVP), manage guest rooms and record attendance. The iOS app is for organisers only; guests use their personal invitation link.</p>
          <h2 className="go" style={{ fontSize: 22 }}>Information we hold</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Invitees: rank, name, mobile number, city, preferred language, and notes added by the organisers.</li>
            <li>Replies: names, relation and age group of family members attending, meal preference and dietary notes, guest-room request with arrival and departure times.</li>
            <li>Event day: attendance (present / absent) and the time it was marked.</li>
            <li>Organisers: name, username, role, optional phone number, a password (stored only as a secure hash) and, for senior roles, a two-step login key.</li>
            <li>App notifications: a device token so the app can show alerts to organisers who allow them.</li>
            <li>An activity log of changes (who changed what, and when) for accountability.</li>
          </ul>
          <h2 className="go" style={{ fontSize: 22 }}>How it is used</h2>
          <p style={{ margin: 0 }}>Only to organise the event: sending invitations and reminders on WhatsApp, planning catering and guest rooms, and admitting guests at the gate. We do not sell or share this information, show advertising, or use tracking or analytics services.</p>
          <h2 className="go" style={{ fontSize: 22 }}>Who can see it</h2>
          <p style={{ margin: 0 }}>Organisers see only what their role allows (for example, a volunteer at the gate sees names for check-in, not mobile numbers). A guest sees their own invitation after entering the PIN sent to them.</p>
          <h2 className="go" style={{ fontSize: 22 }}>Camera</h2>
          <p style={{ margin: 0 }}>The app uses the camera only to scan guests’ entry QR codes at the gate. Pictures are not stored or uploaded.</p>
          <h2 className="go" style={{ fontSize: 22 }}>Keeping and deleting information</h2>
          <p style={{ margin: 0 }}>Information is kept only as long as the organisers need it for the event and its records, then deleted. Guests or organisers can ask the event organisers to correct or delete their information at any time.</p>
          <h2 className="go" style={{ fontSize: 22 }}>Contact</h2>
          <p style={{ margin: 0 }}>Questions about your information: contact the {reg} event organisers, or the developer via <a href="https://makjal.com">makjal.com</a>.</p>
        </section>
        <p className="credit">{credit}</p>
      </main>
    </Frame>
  );
}
