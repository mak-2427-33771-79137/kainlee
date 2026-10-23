'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { admin, toast, download } from '@/components/client';

// Tick what to empty. Items lower in the list automatically include what depends on them.
const GROUPS = [
  { id: 'audit', label: 'Activity log', tables: 'audit_log', desc: 'History of who changed what.' },
  { id: 'notifications', label: 'Notifications', tables: 'notifications', desc: 'In-app alerts for all users.' },
  { id: 'devices', label: 'Notification devices', tables: 'push_subscriptions, native_push_tokens', desc: 'Phones/browsers registered for alerts; users turn alerts on again.' },
  { id: 'attendance', label: 'Gate check-in marks', tables: 'member_functions (attendance), walk-ins', desc: 'Present / absent marks and walk-ins. Guests and RSVPs stay.' },
  { id: 'allotments', label: 'Room allotments', tables: 'room_allotments', desc: 'Which guest has which room. Rooms and requests stay.' },
  { id: 'rooms', label: 'Guest rooms', tables: 'rooms', desc: 'The room list (and its allotments).', implies: ['allotments'] },
  { id: 'guests', label: 'Guests & RSVPs', tables: 'invitations, members, member_functions', desc: 'Everyone invited to every event, their family lists, replies and check-ins. The directory and events stay.', implies: ['allotments', 'attendance'] },
  { id: 'invitees', label: 'Invitee directory', tables: 'invitees', desc: 'All people in the directory (and therefore all guests).', implies: ['guests'] },
  { id: 'events', label: 'Events', tables: 'events, functions, series', desc: 'All events and their functions, guests and rooms.', implies: ['guests', 'rooms'] },
];
const close = (set) => {
  const out = new Set(set); let grew = true;
  while (grew) { grew = false; for (const g of GROUPS) if (out.has(g.id)) for (const d of g.implies || []) if (!out.has(d)) { out.add(d); grew = true; } }
  return out;
};

export default function ClearData() {
  const router = useRouter();
  const [counts, setCounts] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => close(picked), [picked]);
  useEffect(() => { admin('data.counts').then((r) => setCounts(r.counts)).catch(() => {}); }, []);
  const toggle = (id) => { const s = new Set(picked); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };
  const total = [...all].reduce((a, g) => a + (counts?.[g] || 0), 0);

  async function go(e) {
    e.preventDefault();
    if (!window.confirm(`Permanently delete ${total.toLocaleString('en-IN')} records? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await admin('data.clear', { groups: [...all], confirm, password });
      setCounts(r.counts); setPicked(new Set()); setConfirm(''); setPassword('');
      toast('Data cleared'); router.refresh();
    } catch (er) { toast(er.message, true); } finally { setBusy(false); }
  }

  return (
    <section className="card3 band stack" style={{ padding: '18px 14px 14px', borderColor: 'rgba(255,110,90,.35)' }} id="clear-data">
      <h2 className="go" style={{ fontSize: 22 }}>Clear data</h2>
      <p className="mu" style={{ margin: 0, fontSize: 14 }}>Empty chosen tables, for example to remove test data before the real invitations go out. Users, roles and settings are never touched. <b>Download a backup first</b>; deleted data cannot be recovered.</p>
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => download('/api/admin/backup')}><Icon n="dl" />Download backup first</button>
      <form className="stack" onSubmit={go}>
        <div className="stack" style={{ gap: 6 }}>
          {GROUPS.map((g) => {
            const auto = all.has(g.id) && !picked.has(g.id);
            return (
              <label key={g.id} className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap', background: all.has(g.id) ? 'var(--well-red)' : 'var(--well)', borderRadius: 10, padding: '9px 11px' }}>
                <input type="checkbox" checked={all.has(g.id)} disabled={auto} onChange={() => toggle(g.id)} style={{ width: 20, height: 20, marginTop: 2, flex: 'none', accentColor: '#FF2828' }} />
                <span style={{ flex: 1 }}>
                  <b>{g.label}</b> <span className="mu num">· {counts ? (counts[g.id] ?? 0).toLocaleString('en-IN') : '…'} rows</span>{auto && <span className="chip dec" style={{ marginLeft: 6 }}>included</span>}
                  <br /><span className="mu" style={{ fontSize: 13 }}>{g.desc}</span>
                  <br /><code style={{ fontSize: 11.5, opacity: 0.7 }}>{g.tables}</code>
                </span>
              </label>
            );
          })}
        </div>
        {all.size > 0 && (<>
          <div className="err">{total.toLocaleString('en-IN')} records will be deleted permanently.</div>
          <div className="grid2">
            <label className="field"><span>Type DELETE to confirm</span><input className="inp" id="clear-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" /></label>
            <label className="field"><span>Your password</span><input className="inp" id="clear-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          </div>
          <button className="btn pri" disabled={busy || confirm.trim() !== 'DELETE' || !password}><Icon n="x" />Delete selected data</button>
        </>)}
      </form>
    </section>
  );
}
