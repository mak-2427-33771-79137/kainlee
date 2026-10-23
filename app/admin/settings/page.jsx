import { pageUser, allowed } from '@/lib/page';
import { db } from '@/lib/db';
import { regimentName, getSetting } from '@/lib/settings';
import { fmtShort } from '@/lib/util';
import NoAccess from '@/components/NoAccess';
import Settings from './Settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings & activity' };

export default async function SettingsPage({ searchParams }) {
  const user = await pageUser();
  if (!allowed(user, 'settings.manage')) return <NoAccess what="settings" />;
  const sp = await searchParams;
  const k = await db();
  const q = k('audit_log').orderBy('id', 'desc').limit(300);
  if (sp.user) q.where('user_id', Number(sp.user));
  if (sp.event) q.where('event_id', Number(sp.event));
  if (sp.guests === '1') q.where('actor', 'like', 'Guest:%');
  if (sp.q) q.where((w) => w.where('details', 'like', `%${sp.q}%`).orWhere('action', 'like', `%${sp.q}%`).orWhere('actor', 'like', `%${sp.q}%`));
  const log = await q;
  const users = await k('users').select('id', 'name').orderBy('name');
  const events = await k('events').select('id', 'name').orderBy('id', 'desc');
  return (
    <Settings
      s={{ regiment_name: await regimentName(), credit_text: (await getSetting('credit_text')) ?? 'Crafted with pride by Mak · makjal.com', war_cry: (await getSetting('war_cry')) ?? 'Jai Mahakali, Ayo Gorkhali!' }}
      log={log.map((l) => ({ id: l.id, at: `${fmtShort(l.at)} ${new Date(l.at).getUTCFullYear()}`, actor: l.actor, action: l.action, details: l.details, event: events.find((e) => e.id === l.event_id)?.name || '', ip: l.ip }))}
      users={users} events={events} filters={sp} canClear={allowed(user, 'data.clear')}
    />
  );
}
