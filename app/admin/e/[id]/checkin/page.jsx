import { pageUser, pageEvent, allowed } from '@/lib/page';
import { fmtDate, fmtHrs } from '@/lib/util';
import { can } from '@/lib/rbac';
import NoAccess from '@/components/NoAccess';
import Checkin from './Checkin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Check-in' };

export default async function CheckinPage({ params }) {
  const user = await pageUser();
  const ev = await pageEvent(params);
  if (!allowed(user, 'checkin.mark', 'checkin.mark_own')) return <NoAccess what="check-in" />;
  // default to the function happening today, else the next one, else the last
  const now = Date.now();
  const fns = ev.functions;
  const today = fns.find((f) => Math.abs(new Date(f.starts_at) - now) < 14 * 3600e3);
  const next = fns.find((f) => new Date(f.starts_at) > now);
  const def = (today || next || fns[fns.length - 1])?.id || null;
  return (
    <Checkin
      event={{ id: ev.id, name: ev.name }}
      functions={fns.map((f) => ({ id: f.id, name: f.name, when: `${fmtDate(f.starts_at)}, ${fmtHrs(f.starts_at)}` }))}
      defaultFn={def}
      ownOnly={!can(user.role, 'checkin.mark')}
      me={user.name}
    />
  );
}
