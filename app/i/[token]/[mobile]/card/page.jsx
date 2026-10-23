import { notFound } from 'next/navigation';
import CardScreen from '@/components/guest/CardScreen';
import { tokenFor } from '@/lib/links';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitation card' };

// Readable link: /i/<event code>/<mobile>/card
export default async function ReadableCardPage({ params }) {
  const { token: code, mobile } = await params;
  const t = await tokenFor(code, mobile);
  if (!t) notFound();
  return <CardScreen token={t} />;
}
