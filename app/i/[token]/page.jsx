import { notFound } from 'next/navigation';
import Frame from '@/components/Frame';
import GuestApp from './GuestApp';
import { db } from '@/lib/db';
import { guestAuthed, guestView } from '@/lib/guest';
import { displayName } from '@/lib/data';
import { regimentName, getSetting } from '@/lib/settings';

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
  const reg = await regimentName();
  return {
    title: `Invitation · ${displayName(r)}`,
    description: `${reg} cordially invites you to ${r.event}`,
    manifest: `/i/${token}/manifest.webmanifest`,
    openGraph: { title: `${reg} · Invitation for ${displayName(r)}`, description: r.event, images: [{ url: '/api/logo/512', width: 512, height: 512 }] },
  };
}

export default async function GuestPage({ params }) {
  const { token } = await params;
  const r = await find(token);
  if (!r) notFound();
  const authed = (await guestAuthed(token)) === r.id;
  return (
    <Frame>
      <GuestApp
        token={token}
        initial={authed ? await guestView(token) : null}
        preview={{ name: displayName(r), lang: r.lang, regiment: await regimentName(), event: r.event, credit: (await getSetting('credit_text')) ?? 'Crafted with pride by Mak · makjal.com' }}
      />
    </Frame>
  );
}
