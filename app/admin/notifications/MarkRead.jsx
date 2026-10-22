'use client';
import { useRouter } from 'next/navigation';
import { admin } from '@/components/client';

export default function MarkRead() {
  const router = useRouter();
  return <button type="button" className="btn" onClick={async () => { await admin('notif.read', {}); router.refresh(); }}>Mark all read</button>;
}
