import CardScreen from '@/components/guest/CardScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitation card' };

export default async function CardPage({ params }) {
  const { token } = await params;
  return <CardScreen token={token} />;
}
