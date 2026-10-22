import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { audit } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Full data backup as JSON (secrets excluded). Download before big changes.
export async function GET(req) {
  const user = await getAdmin();
  if (!user || !can(user.role, 'settings.manage')) return NextResponse.json({ error: 'Only the Super Admin can download backups.' }, { status: 403 });
  const k = await db();
  const tables = ['series', 'events', 'functions', 'invitees', 'invitations', 'members', 'member_functions', 'rooms', 'room_allotments'];
  const out = { app: 'kainlee', exported_at: new Date().toISOString(), tables: {} };
  for (const t of tables) out.tables[t] = await k(t);
  out.tables.users = await k('users').select('id', 'name', 'username', 'phone', 'role', 'active', 'notify_all', 'created_at');
  await audit({ user, action: 'backup.download', req });
  return new Response(JSON.stringify(out), {
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="kainlee-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' },
  });
}
