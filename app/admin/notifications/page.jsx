import Link from 'next/link';
import { pageUser } from '@/lib/page';
import { db } from '@/lib/db';
import { fmtShort } from '@/lib/util';
import MarkRead from './MarkRead';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function Notifications() {
  const user = await pageUser();
  const k = await db();
  const list = await k('notifications').where({ user_id: user.id }).orderBy('id', 'desc').limit(150);
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <>
      <div className="top"><div style={{ flex: 1 }}><h1>Notifications</h1><div className="mu">{unread} unread</div></div>{unread > 0 && <MarkRead />}<Link className="btn" href="/admin/account">Phone alerts</Link></div>
      <section className="card3 band stack" style={{ padding: '16px 14px 10px', gap: 0 }}>
        {list.length === 0 && <p className="mu">Nothing yet. You’ll see guest changes here.</p>}
        {list.map((n) => (
          <Link key={n.id} href={n.url || '#'} style={{ display: 'block', padding: '10px 6px', borderBottom: '1px dashed var(--rule)', color: 'inherit', textDecoration: 'none', background: n.read_at ? 'none' : 'rgba(255,40,40,.05)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b>{!n.read_at && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9, background: 'var(--red)', marginRight: 6 }} />}{n.title}</b><span className="mu num" style={{ fontSize: 13 }}>{fmtShort(n.created_at)}</span></div>
            {n.body && <div className="mu" style={{ fontSize: 14 }}>{n.body}</div>}
          </Link>
        ))}
      </section>
    </>
  );
}
