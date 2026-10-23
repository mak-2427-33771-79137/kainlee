import { notFound } from 'next/navigation';
import Frame from '@/components/Frame';
import GuestApp from '@/app/i/[token]/GuestApp';
import { guestAuthed, guestView } from '@/lib/guest';
import { regimentName, getSetting } from '@/lib/settings';
import { requestBase } from '@/lib/page';
import { linkFor } from '@/lib/guestLink';

// Shared by /i/<token> and /i/<event code>/<mobile>.
// Before the PIN, nothing personal is shown (the readable link can be guessed from a phone number).
export async function guestMeta(token) {
  const r = await linkFor(token);
  if (!r) return { title: 'Invitation' };
  const [reg, base] = await Promise.all([regimentName(), requestBase()]);
  const title = `${reg} · ${r.event}`;
  const image = { url: `${base}/i/${r.code}/preview.png`, width: 1200, height: 630, alt: 'Invitation card' };
  return {
    title: `Invitation · ${r.event}`,
    description: `${reg} cordially invites you to ${r.event}. Open with your PIN.`,
    manifest: `/i/${token}/manifest.webmanifest`,
    openGraph: { type: 'website', title, description: 'Your invitation · open with your PIN', url: `${base}${r.path}`, images: [image] },
    twitter: { card: 'summary_large_image', title, images: [image.url] },
  };
}

export default async function GuestScreen({ token, next }) {
  const r = await linkFor(token);
  if (!r) notFound();
  const authed = (await guestAuthed(token)) === r.id;
  const [initial, regiment, credit] = await Promise.all([authed ? guestView(token) : null, regimentName(), getSetting('credit_text')]);
  const go = next === 'pdf' ? (r.card_mode === 'builtin' ? `${r.path}/invitation.pdf` : `${r.path}/card`) : next === 'card' ? `${r.path}/card` : null;
  return (
    <Frame>
      <GuestApp
        token={token}
        path={r.path}
        next={go}
        initial={initial}
        preview={{ lang: r.lang, regiment, event: r.event, credit: credit ?? 'Crafted with pride by Mak · makjal.com' }}
      />
    </Frame>
  );
}
