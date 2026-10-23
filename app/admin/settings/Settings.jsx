'use client';
import ClearData from './ClearData';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import { admin, toast, download } from '@/components/client';

// Resize an uploaded image to square PNGs in the browser (no server image tools needed).
function toPng(img, size, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
  const inner = bg ? size * 0.74 : size;
  const s = Math.min(inner / img.width, inner / img.height);
  const w = img.width * s, h = img.height * s;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/png');
}

export default function Settings({ s, log, users, events, filters, canClear }) {
  const router = useRouter();
  const path = usePathname();
  const [f, setF] = useState(s);
  const [busy, setBusy] = useState(false);
  const [lq, setLq] = useState(filters.q || '');
  const run = async (fx, ok) => { setBusy(true); try { await fx(); if (ok) toast(ok); router.refresh(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };
  const setFilter = (patch) => { const n = { ...filters, ...patch }; for (const k of Object.keys(n)) if (!n[k]) delete n[k]; router.push(`${path}?${new URLSearchParams(n)}`); };

  const onLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => run(() => admin('logo.save', { png512: toPng(img, 512), png192: toPng(img, 192), maskable: toPng(img, 512, '#00572D') }), 'Crest updated everywhere');
    img.onerror = () => toast('Could not read that image.', true);
    img.src = URL.createObjectURL(file);
  };

  return (
    <>
      <div className="top"><h1>Settings &amp; activity</h1></div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <form className="card3 band stack" style={{ padding: '18px 14px 14px' }} onSubmit={(e) => { e.preventDefault(); run(() => admin('settings.save', f), 'Settings saved'); }}>
          <h2 className="go" style={{ fontSize: 22 }}>Identity</h2>
          <label className="field"><span>Regiment name</span><input className="inp" id="s-reg" value={f.regiment_name} onChange={(e) => setF({ ...f, regiment_name: e.target.value })} /></label>
          <label className="field"><span>Credit line (shown on every page)</span><input className="inp" id="s-credit" value={f.credit_text} onChange={(e) => setF({ ...f, credit_text: e.target.value })} /></label>
          <label className="field"><span>Celebration line (shown to guests after they reply)</span><input className="inp" id="s-cry" value={f.war_cry} onChange={(e) => setF({ ...f, war_cry: e.target.value })} /></label>
          <button className="btn pri" disabled={busy}>Save</button>
        </form>
        <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
          <h2 className="go" style={{ fontSize: 22 }}>Crest / logo</h2>
          <div className="row"><img className="coin" src={`/api/logo/192?t=${Date.now()}`} alt="Current crest" width={90} height={90} /><span className="mu" style={{ flex: 1 }}>Used on the site, the installed app icon, invitation cards and every PDF. Best: square PNG with a transparent background, 512 px or larger.</span></div>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="inp" onChange={onLogo} aria-label="Upload new crest" />
          <button type="button" className="btn ghost" onClick={() => run(() => admin('logo.save', { reset: true }), 'Crest reset')}>Reset to default crest</button>
          <h2 className="go" style={{ fontSize: 22, marginTop: 8 }}>Backup</h2>
          <p className="mu" style={{ margin: 0, fontSize: 14 }}>Download all events, guests, RSVPs, rooms and attendance. Do this before big changes or before rolling back a version.</p>
          <button type="button" className="btn" onClick={() => download('/api/admin/backup')}><Icon n="dl" />Download backup (JSON)</button>
        </section>
      </div>

      <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="go" style={{ fontSize: 24 }}>Activity log</h2>
          <button type="button" className="btn" onClick={() => download(`/api/admin/export?report=activity${filters.user ? `&user=${filters.user}` : ''}${filters.event ? `&event=${filters.event}` : ''}`)}><Icon n="dl" />Export Excel</button>
        </div>
        <p className="mu" style={{ margin: 0, fontSize: 14 }}>Every change is recorded with who made it and when (IST): logins, RSVPs by guests, edits, sends, PIN resets, room allotments, check-ins, exports and settings.</p>
        <div className="row">
          <select className="inp" aria-label="User" value={filters.user || ''} onChange={(e) => setFilter({ user: e.target.value })} style={{ width: 'auto' }}><option value="">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <select className="inp" aria-label="Event" value={filters.event || ''} onChange={(e) => setFilter({ event: e.target.value })} style={{ width: 'auto' }}><option value="">All events</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={filters.guests === '1'} onChange={(e) => setFilter({ guests: e.target.checked ? '1' : '' })} />Guest changes only</label>
          <form onSubmit={(e) => { e.preventDefault(); setFilter({ q: lq }); }} className="row" style={{ flex: '1 1 200px' }}><input className="inp" aria-label="Search log" value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Search…" /></form>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: '60vh' }}><table className="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>Event</th></tr></thead>
          <tbody>{log.map((l) => <tr key={l.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{l.at}</td><td>{l.actor}</td><td><code>{l.action}</code></td><td style={{ fontSize: 13.5 }}>{l.details}</td><td className="sub">{l.event}</td></tr>)}</tbody>
        </table></div>
      </section>
      {canClear && <ClearData />}
    </>
  );
}
