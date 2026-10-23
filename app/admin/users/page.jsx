import { pageUser, allowed } from '@/lib/page';
import { db } from '@/lib/db';
import { ROLES, MODULES } from '@/lib/rbac';
import { prettyMobile, fmtShort } from '@/lib/util';
import NoAccess from '@/components/NoAccess';
import Users from './Users';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Users & roles' };

export default async function UsersPage() {
  const user = await pageUser();
  if (!allowed(user, 'users.manage')) return <NoAccess what="user management" />;
  const k = await db();
  const users = await k('users').orderBy([{ column: 'active', order: 'desc' }, { column: 'name' }]);
  const load = await k('invitations').whereNotNull('handler_id').select('handler_id').count({ n: '*' }).groupBy('handler_id');
  const n = Object.fromEntries(load.map((r) => [r.handler_id, Number(r.n)]));
  return (
    <Users
      me={user.id}
      roles={Object.entries(ROLES).map(([id, r]) => ({ id, label: r.label, twofa: r.twofa, builtin: r.builtin, modules: r.modules, users: users.filter((x) => x.role === id).length }))}
      modules={MODULES.map(({ id, label, desc }) => ({ id, label, desc }))}
      users={users.map((u) => ({ id: u.id, name: u.name, username: u.username, phone: u.phone || '', phonePretty: prettyMobile(u.phone), role: u.role, active: !!u.active, notify_all: !!u.notify_all, totp: !!u.totp_enabled, last: u.last_login_at ? fmtShort(u.last_login_at) : 'never', guests: n[u.id] || 0 }))}
    />
  );
}
