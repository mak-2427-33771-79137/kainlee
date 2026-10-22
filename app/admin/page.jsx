import { redirect } from 'next/navigation';
import { pageUser } from '@/lib/page';
import { listEvents } from '@/lib/data';
import { homeFor, can } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const user = await pageUser();
  const events = await listEvents();
  const ev = events.find((e) => e.status === 'active') || events[0];
  if (!ev) redirect(can(user.role, 'events.manage') ? '/admin/events' : '/admin/account');
  const home = homeFor(user.role);
  redirect(`/admin/e/${ev.id}${home ? `/${home}` : ''}`);
}
