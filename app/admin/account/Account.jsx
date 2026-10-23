'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { admin, toast } from '@/components/client';
import { isNative, registerNativePush, nativePushState } from '@/components/native';

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Account({ u }) {
  const router = useRouter();
  const [f, setF] = useState({ phone: u.phone, notify_all: u.notify_all });
  const [pw, setPw] = useState({ current: '', password: '' });
  const [push, setPush] = useState('unknown');
  const [installEvt, setInstallEvt] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [app, setApp] = useState(false);

  useEffect(() => {
    if (isNative()) {
      setApp(true); setStandalone(true);
      nativePushState().then((s) => setPush(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'default'));
      return;
    }
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) setPush('unsupported');
    else setPush(Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default');
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  async function enablePush() {
    if (app) {
      const r = await registerNativePush((token) => admin('push.native', { token, device: navigator.userAgent.slice(0, 150) }));
      setPush(r === 'granted' ? 'granted' : 'denied');
      toast(r === 'granted' ? 'Notifications are on for this device' : 'Notifications are off. Turn them on in iPhone Settings › Kainlee.', r !== 'granted');
      return;
    }
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPush(perm); toast('Notifications were not allowed.', true); return; }
      const { key } = await admin('push.key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      await admin('push.subscribe', { subscription: sub.toJSON() });
      setPush('granted'); toast('Notifications are on for this device'); router.refresh();
    } catch (e) { toast(e.message || 'Could not turn on notifications', true); }
  }

  const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <>
      <div className="top"><div style={{ flex: 1 }}><div className="lbl">{u.role}</div><h1>{u.name}</h1></div></div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
          <h2 className="go" style={{ fontSize: 22 }}>Use it like an app</h2>
          {standalone ? <div className="okmsg">{app ? 'You are using the Kainlee iOS app.' : 'You are using the installed app.'}</div> : installEvt ? (
            <button type="button" className="btn pri" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }}><Icon n="dl" />Install on this device</button>
          ) : (
            <p style={{ margin: 0 }}>{ios ? <>On iPhone/iPad: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</> : <>In Chrome: open the menu (⋮) and tap <b>Install app</b> or <b>Add to Home screen</b>.</>}</p>
          )}
          <h2 className="go" style={{ fontSize: 22, marginTop: 6 }}>Notifications</h2>
          <p className="mu" style={{ margin: 0, fontSize: 14 }}>Get an alert on this phone when your guests change their RSVP, family list or guest room, or when guests are assigned to you. {u.devices ? `${u.devices} device(s) registered.` : ''}</p>
          {push === 'granted' && <div className="okmsg">Notifications allowed on this device.</div>}
          {push === 'denied' && <div className="err">{app ? 'Notifications are off for Kainlee. Turn them on in iPhone Settings › Kainlee › Notifications.' : 'Notifications are blocked for this site. Allow them in your browser settings, then come back.'}</div>}
          {push === 'unsupported' && <div className="err">{ios ? 'On iPhone/iPad, first add this site to your Home Screen and open it from there (iOS 16.4 or later).' : 'This browser does not support notifications.'}</div>}
          {(push === 'default' || push === 'granted') && <button type="button" className="btn grn" onClick={enablePush}><Icon n="bell" />{push === 'granted' ? 'Re-register this device' : 'Turn on notifications'}</button>}
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await admin('account.notify', f); toast('Saved'); } catch (er) { toast(er.message, true); } }}>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.notify_all} onChange={(e) => setF({ ...f, notify_all: e.target.checked })} />Alert me about every guest change, not only my guests</label>
            <label className="field"><span>My mobile (guests I look after can call me)</span><input className="inp" id="me-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></label>
            <button className="btn">Save</button>
          </form>
        </section>
        <form className="card3 band stack" style={{ padding: '18px 14px 14px' }} onSubmit={async (e) => { e.preventDefault(); try { await admin('account.password', pw); toast('Password changed. Please log in again.'); setTimeout(() => (location.href = '/login'), 1200); } catch (er) { toast(er.message, true); } }}>
          <h2 className="go" style={{ fontSize: 22 }}>Password</h2>
          <label className="field"><span>Current password</span><input className="inp" id="pw-cur" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required /></label>
          <label className="field"><span>New password (8+ characters)</span><input className="inp" id="pw-new" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" required /></label>
          <button className="btn pri">Change password</button>
          <p className="mu" style={{ margin: 0, fontSize: 13.5 }}>Username: <b>{u.username}</b> · 2-step login: <b>{u.totp ? 'on' : 'not required for your role'}</b></p>
        </form>
      </div>
    </>
  );
}
