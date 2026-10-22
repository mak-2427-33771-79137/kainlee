'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import { admin, toast } from '@/components/client';

const PERMS = [
  ['Super Admin', 'Everything, including users, settings, activity log and deleting events. 2-step login.'],
  ['Event Coordinator', 'Events, invitees, cards, sending, any guest, rooms, assigning handlers, exports, check-in. 2-step login.'],
  ['Liaison Officer', 'Sees the whole guest list. Edits, resets PIN, sends invites, marks attendance and exports only for guests assigned to them; can transfer them to another handler.'],
  ['Check-in Volunteer', 'Gate check-in only (scan, search, mark present/absent, add walk-ins).'],
  ['Viewer', 'Read-only dashboard, guest list and rooms.'],
  ['Catering / Admin Staff', 'Headcounts and catering sheet only. No personal details.'],
];

export default function Users({ users, roles, me }) {
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const label = Object.fromEntries(roles.map((r) => [r.id, r.label]));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await admin('user.save', form); toast('User saved'); setForm(null); router.refresh(); } catch (er) { toast(er.message, true); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="top"><div style={{ flex: 1 }}><h1>Users &amp; roles</h1></div><button type="button" className="btn pri" onClick={() => setForm({ name: '', username: '', phone: '', role: 'liaison', active: true, notify_all: false, password: '' })}><Icon n="plus" />Add user</button></div>
      <div className="card3" style={{ overflow: 'hidden' }}>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Phone</th><th>Guests looked after</th><th>2FA</th><th>Last login</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
              <td><b>{u.name}</b>{!u.active && <span className="chip dec" style={{ marginLeft: 6 }}>Disabled</span>}{u.notify_all && <div className="sub">Gets all guest-change alerts</div>}</td>
              <td>{u.username}</td><td>{label[u.role]}</td><td className="num">{u.phonePretty || '—'}</td><td className="num">{u.guests}</td>
              <td>{u.totp ? <span className="chip att">On</span> : <span className="chip gray">Off</span>}</td><td className="num">{u.last}</td>
              <td><button type="button" className="btn sm" onClick={() => setForm({ ...u, password: '' })}><Icon n="edit" size={15} />Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
        <h2 className="go" style={{ fontSize: 22 }}>What each role can do</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{PERMS.map(([r, d]) => <li key={r} style={{ marginBottom: 4 }}><b>{r}:</b> {d}</li>)}</ul>
      </section>
      {form && (
        <Modal title={form.id ? `Edit ${form.name}` : 'Add user'} onClose={() => setForm(null)}>
          <form className="stack" onSubmit={save}>
            <label className="field"><span>Name with rank</span><input className="inp" id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <div className="grid2">
              <label className="field"><span>Username</span><input className="inp" id="u-user" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" required /></label>
              <label className="field"><span>Mobile (shown to their guests)</span><input className="inp" id="u-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></label>
            </div>
            <label className="field"><span>Role</span><select className="inp" id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
            <label className="field"><span>{form.id ? 'New password (leave blank to keep)' : 'Temporary password (8+ characters)'}</span><input className="inp" id="u-pass" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.notify_all} onChange={(e) => setForm({ ...form, notify_all: e.target.checked })} />Alert this user about every guest change (not only their own guests)</label>
            {form.id && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.active} disabled={form.id === me} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Account active</label>}
            {form.id && form.totp && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!form.reset2fa} onChange={(e) => setForm({ ...form, reset2fa: e.target.checked })} />Reset 2-step login (lost phone)</label>}
            <button className="btn pri" disabled={busy}>Save user</button>
          </form>
        </Modal>
      )}
    </>
  );
}
