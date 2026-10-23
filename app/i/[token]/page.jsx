import GuestScreen, { guestMeta } from '@/components/guest/GuestScreen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { token } = await params;
  return guestMeta(token);
}

export default async function GuestPage({ params, searchParams }) {
  const { token } = await params;
  const { next } = await searchParams;
  return <GuestScreen token={token} next={next} />;
}
