'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import Portal from '@/components/Portal';
import { isNative, registerNativePush } from '@/components/native';
import { api, admin } from '@/components/client';

export default function Shell({ user, events, unread: unread0, perms, regiment, credit, children }) {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState(unread0);
  const m = path.match(/^\/admin\/e\/(\d+)/);
  const evId = m ? Number(m[1]) : (events.find((e) => e.status === 'active') || events[0])?.id;
  const base = evId ? `/admin/e/${evId}` : null;
  const grOn = events.find((e) => e.id === evId)?.guestroom !== false;
  const handlerMe = sp.get('handler') === 'me';

  useEffect(() => { setMore(false); }, [path]);
  // iOS app: register this phone for push notifications (asks permission the first time)
  useEffect(() => {
    if (isNative()) registerNativePush((token) => admin('push.native', { token, device: navigator.userAgent.slice(0, 150) })).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try { const r = await admin('notif.count'); setUnread(r.n); } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const is = (href, exact) => (exact ? path === href : path.startsWith(href));
  const items = [];
  if (base) {
    if (perms.dashboard) items.push({ href: base, label: 'Dashboard', icon: 'dash', on: is(base, true) });
    if (perms.guests) items.push({ href: `${base}/guests`, label: 'All guests', icon: 'users', on: is(`${base}/guests`) && !handlerMe });
    if (perms.handler) items.push({ href: `${base}/guests?handler=me`, label: 'My guests', icon: 'me', on: is(`${base}/guests`) && handlerMe });
    if (perms.rooms && grOn) items.push({ href: `${base}/rooms`, label: 'Guest rooms', icon: 'bed', on: is(`${base}/rooms`) });
    if (perms.checkin) items.push({ href: `${base}/checkin`, label: 'Check-in', icon: 'scan', on: is(`${base}/checkin`) });
    if (perms.send) items.push({ href: `${base}/send`, label: 'Send invites', icon: 'send', on: is(`${base}/send`) });
    if (perms.catering) items.push({ href: `${base}/catering`, label: 'Catering', icon: 'food', on: is(`${base}/catering`) });
    if (perms.eventSetup) items.push({ href: `${base}/settings`, label: 'Event setup & card', icon: 'cal', on: is(`${base}/settings`) });
  }
  const general = [];
  if (perms.events) general.push({ href: '/admin/events', label: 'Events & series', icon: 'cal', on: is('/admin/events') });
  if (perms.directory) general.push({ href: '/admin/directory', label: 'Invitee directory', icon: 'book', on: is('/admin/directory') });
  if (perms.users) general.push({ href: '/admin/users', label: 'Users & roles', icon: 'shield', on: is('/admin/users') });
  if (perms.settings) general.push({ href: '/admin/settings', label: 'Settings & activity', icon: 'gear', on: is('/admin/settings') });
  general.push({ href: '/admin/notifications', label: 'Notifications', icon: 'bell', on: is('/admin/notifications'), badge: unread });
  general.push({ href: '/admin/account', label: 'My account', icon: 'me', on: is('/admin/account') });

  async function logout() {
    try { await api('/api/auth', { action: 'logout' }); } catch {}
    location.href = '/login';
  }

  const NavList = () => (<>
    {events.length > 0 && (
      <label className="field" style={{ padding: '0 6px 8px' }}>
        <span>Event</span>
        <select className="inp" value={evId || ''} onChange={(e) => router.push(`/admin/e/${e.target.value}`)} aria-label="Choose event">
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}{e.status !== 'active' ? ` (${e.status})` : ''}</option>)}
        </select>
      </label>
    )}
    {items.map((i) => <Link key={i.href} href={i.href} className={`nav${i.on ? ' on' : ''}`} onClick={() => setMore(false)}><Icon n={i.icon} />{i.label}</Link>)}
    <div className="navh">General</div>
    {general.map((i) => <Link key={i.href} href={i.href} className={`nav${i.on ? ' on' : ''}`} onClick={() => setMore(false)}><Icon n={i.icon} />{i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}</Link>)}
    <button type="button" className="nav" onClick={logout} style={{ border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }}><Icon n="out" />Log out</button>
  </>);

  const quick = [
    perms.dashboard && base && { href: base, label: 'Dashboard', icon: 'dash', on: is(base, true) },
    perms.handler && base ? { href: `${base}/guests?handler=me`, label: 'My guests', icon: 'me', on: is(`${base}/guests`) && handlerMe }
      : perms.guests && base && { href: `${base}/guests`, label: 'Guests', icon: 'users', on: is(`${base}/guests`) },
    perms.checkin && base && { href: `${base}/checkin`, label: 'Check-in', icon: 'scan', on: is(`${base}/checkin`) },
    { href: '/admin/notifications', label: 'Alerts', icon: 'bell', on: is('/admin/notifications'), badge: unread },
  ].filter(Boolean);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <img className="coin" src="/api/logo/192" alt="" width={46} height={46} />
          <div><div className="go" style={{ fontSize: 26 }}>{regiment}</div><div className="mu" style={{ fontSize: 12.5 }}>{user.name} · {user.roleLabel}</div></div>
        </div>
        <NavList />
        <p className="credit" style={{ marginTop: 'auto', paddingTop: 16 }}>{credit}</p>
      </aside>
      <main className="main">{children}</main>
      <Portal>
        {more && <div className="sheet-dim" onClick={() => setMore(false)} aria-hidden="true" />}
        <div className="more-sheet card3 band" hidden={!more} style={{ padding: '14px 10px' }}>
          <div className="row" style={{ justifyContent: 'space-between', padding: '0 8px 8px', flexWrap: 'nowrap' }}>
            <span className="mu" style={{ fontSize: 13 }}>{user.name} · {user.roleLabel}</span>
            <button type="button" className="btn sm ghost" onClick={() => setMore(false)} aria-label="Close menu">✕</button>
          </div>
          <NavList />
        </div>
        <nav className="bottomnav" aria-label="Quick">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className={q.on ? 'on' : ''} onClick={() => setMore(false)}><Icon n={q.icon} size={22} />{q.label}{q.badge ? <span className="nbadge">{q.badge}</span> : null}</Link>
          ))}
          <button type="button" onClick={() => setMore(!more)} className={more ? 'on' : ''} aria-expanded={more}><Icon n="more" size={22} />More</button>
        </nav>
      </Portal>
    </div>
  );
}
