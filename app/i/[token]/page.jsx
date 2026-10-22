import { notFound } from 'next/navigation';
import Frame from '@/components/Frame';
import GuestApp from './GuestApp';
import { db } from '@/lib/db';
import { guestAuthed, guestView } from '@/lib/guest';
import { displayName } from '@/lib/data';
import { regimentName, getSetting } from '@/lib/settings';
import { requestBase, cardPreviewMeta } from '@/lib/page';

export const dynamic = 'force-dynamic';

async function find(token) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) return null;
  const k = await db();
  return k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').join('events as e', 'e.id', 'i.event_id')
    .where('i.token', token).select('i.id', 'p.rank', 'p.name', 'p.lang', 'e.name as event').first();
}

export async function generateMetadata({ params }) {
  const { token } = await params;
  const r = await find(token);
  if (!r) return { title: 'Invitation' };
  const [reg, base] = await Promise.all([regimentName(), requestBase()]);
  return {
    title: `Invitation · ${displayName(r)}`,
    description: `${reg} cordially invites you to ${r.event}`,
    manifest: `/i/${token}/manifest.webmanifest`,
    ...cardPreviewMeta(base, token, `${reg} · Invitation for ${displayName(r)}`, `${r.event} · Tap to RSVP`),
  };
}

export default async function GuestPage({ params }) {
  const { token } = await params;
  const r = await find(token);
  if (!r) notFound();
  const authed = (await guestAuthed(token)) === r.id;
  const [initial, regiment, credit] = await Promise.all([authed ? guestView(token) : null, regimentName(), getSetting('credit_text')]);
  return (
    <Frame>
      <GuestApp
        token={token}
        initial={initial}
        preview={{ name: displayName(r), lang: r.lang, regiment, event: r.event, credit: credit ?? 'Crafted with pride by Mak · makjal.com' }}
      />
    </Frame>
  );
}
