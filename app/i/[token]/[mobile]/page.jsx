import { notFound } from 'next/navigation';
import GuestScreen, { guestMeta } from '@/components/guest/GuestScreen';
import { tokenFor } from '@/lib/links';

export const dynamic = 'force-dynamic';

// Readable link: /i/<event code>/<mobile>
export async function generateMetadata({ params }) {
  const { token: code, mobile } = await params;
  const t = await tokenFor(code, mobile);
  return t ? guestMeta(t) : { title: 'Invitation' };
}

export default async function ReadableGuestPage({ params, searchParams }) {
  const { token: code, mobile } = await params;
  const { next } = await searchParams;
  const t = await tokenFor(code, mobile);
  if (!t) notFound();
  return <GuestScreen token={t} next={next} />;
}
