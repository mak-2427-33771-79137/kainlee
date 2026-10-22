import { pageUser, pageEvent, allowed } from '@/lib/page';
import { can } from '@/lib/rbac';
import NoAccess from '@/components/NoAccess';
import SendQueue from './SendQueue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Send invites' };

export default async function SendPage({ params }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  if (!allowed(user, 'invites.send', 'invites.send_own')) return <NoAccess what="sending invitations" />;
  return <SendQueue event={{ id: ev.id, name: ev.name, cardMode: ev.card_mode }} all={can(user.role, 'invites.send')} />;
}
