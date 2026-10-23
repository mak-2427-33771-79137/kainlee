import { pageUser } from '@/lib/page';
import { db } from '@/lib/db';
import { ROLES } from '@/lib/rbac';
import Account from './Account';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My account' };

export default async function AccountPage() {
  const user = await pageUser();
  const k = await db();
  const u = await k('users').where({ id: user.id }).first();
  const subs = await k('push_subscriptions').where({ user_id: user.id }).count({ n: '*' }).first();
  const apps = await k('native_push_tokens').where({ user_id: user.id }).count({ n: '*' }).first();
  return <Account u={{ name: u.name, username: u.username, role: ROLES[u.role].label, phone: u.phone || '', notify_all: !!u.notify_all, totp: !!u.totp_enabled, devices: Number(subs.n) + Number(apps.n) }} />;
}
