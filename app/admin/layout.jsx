import Frame from '@/components/Frame';
import Shell from './Shell';
import { pageUser, navPerms } from '@/lib/page';
import { listEvents } from '@/lib/data';
import { unreadCount } from '@/lib/notify';
import { regimentName, getSetting } from '@/lib/settings';
import { ROLES } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const metadata = { manifest: '/admin-manifest.webmanifest' };

export default async function AdminLayout({ children }) {
  const user = await pageUser();
  const events = (await listEvents()).map((e) => ({ id: e.id, name: e.name, status: e.status, guestroom: !!e.guestroom_enabled }));
  return (
    <Frame>
      <Shell
        user={{ id: user.id, name: user.name, role: user.role, roleLabel: ROLES[user.role]?.label }}
        events={events}
        unread={await unreadCount(user.id)}
        perms={navPerms(user.role)}
        regiment={await regimentName()}
        credit={(await getSetting('credit_text')) ?? 'Crafted with pride by Mak · makjal.com'}
      >
        {children}
      </Shell>
    </Frame>
  );
}
