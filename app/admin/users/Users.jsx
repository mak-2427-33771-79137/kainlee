'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import { admin, toast } from '@/components/client';

export default function Users({ users, roles, modules, me }) {
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [roleForm, setRoleForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const label = Object.fromEntries(roles.map((r) => [r.id, r.label]));
  const modLabel = Object.fromEntries(modules.map((m) => [m.id, m.label]));
  const run = async (fx, ok) => { setBusy(true); try { await fx(); if (ok) toast(ok); router.refresh(); return true; } catch (er) { toast(er.message, true); return false; } finally { setBusy(false); } };

  const save = async (e) => { e.preventDefault(); if (await run(() => admin('user.save', form), 'User saved')) setForm(null); };
  const saveRole = async (e) => { e.preventDefault(); if (await run(() => admin('role.save', roleForm), roleForm.key ? 'Role updated' : 'Role created')) setRoleForm(null); };
  const delUser = (u) => {
    if (!window.confirm(`Delete ${u.name} (${u.username})?${u.guests ? ` The ${u.guests} guest(s) they look after will become unassigned.` : ''} This cannot be undone.`)) return;
    run(() => admin('user.delete', { id: u.id }), 'User deleted');
  };
  const delRole = (r) => {
    if (!window.confirm(`Delete the role "${r.label}"?`)) return;
    run(() => admin('role.delete', { key: r.id }), 'Role deleted');
  };
  const toggleMod = (id) => setRoleForm({ ...roleForm, modules: roleForm.modules.includes(id) ? roleForm.modules.filter((m) => m !== id) : [...roleForm.modules, id] });

  return (
    <>
      <div className="top">
        <div style={{ flex: 1 }}><h1>Users &amp; roles</h1></div>
        <button type="button" className="btn" onClick={() => setRoleForm({ label: '', twofa: false, modules: ['dashboard'] })}><Icon n="shield" />New role</button>
        <button type="button" className="btn pri" onClick={() => setForm({ name: '', username: '', phone: '', role: roles.find((r) => r.id === 'liaison') ? 'liaison' : roles[0]?.id, active: true, notify_all: false, password: '' })}><Icon n="plus" />Add user</button>
      </div>

      <div className="card3" style={{ overflow: 'hidden' }}>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Phone</th><th>Guests looked after</th><th>2FA</th><th>Last login</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
              <td><b>{u.name}</b>{!u.active && <span className="chip dec" style={{ marginLeft: 6 }}>Disabled</span>}{u.notify_all && <div className="sub">Gets all guest-change alerts</div>}</td>
              <td>{u.username}</td><td>{label[u.role] || <span className="chip dec">No role</span>}</td><td className="num">{u.phonePretty || '—'}</td><td className="num">{u.guests}</td>
              <td>{u.totp ? <span className="chip att">On</span> : <span className="chip gray">Off</span>}</td><td className="num">{u.last}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="btn sm" onClick={() => setForm({ ...u, password: '' })}><Icon n="edit" size={15} />Edit</button>{' '}
                {u.id !== me && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => delUser(u)} aria-label={`Delete ${u.name}`}><Icon n="x" size={15} />Delete</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <section className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="go" style={{ fontSize: 24 }}>Roles</h2>
          <span className="mu" style={{ fontSize: 13.5 }}>A role is a set of modules. Give each user one role.</span>
        </div>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' }}>
          {roles.map((r) => (
            <div key={r.id} className="card3 band stack" style={{ padding: '16px 14px 12px', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <div><b style={{ fontSize: 16 }}>{r.label}</b><div className="mu" style={{ fontSize: 12.5 }}>{r.users} user{r.users === 1 ? '' : 's'}{r.twofa ? ' · 2-step login' : ''}{r.builtin ? ' · built-in' : ''}</div></div>
                {r.id !== 'super_admin' && (
                  <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <button type="button" className="btn sm" aria-label={`Edit role ${r.label}`} onClick={() => setRoleForm({ key: r.id, label: r.label, twofa: r.twofa, modules: [...r.modules] })}><Icon n="edit" size={15} /></button>
                    {!r.users && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} aria-label={`Delete role ${r.label}`} onClick={() => delRole(r)}><Icon n="x" size={15} /></button>}
                  </span>
                )}
              </div>
              <div className="row" style={{ gap: 5 }}>
                {r.id === 'super_admin' ? <span className="chip att">Every module</span> : r.modules.map((m) => <span key={m} className="chip gray">{modLabel[m]}</span>)}
              </div>
            </div>
          ))}
        </div>
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
            {roles.find((r) => r.id === form.role) && (
              <div className="mu" style={{ fontSize: 13 }}>Can use: {form.role === 'super_admin' ? 'everything' : roles.find((r) => r.id === form.role).modules.map((m) => modLabel[m]).join(', ')}</div>
            )}
            <label className="field"><span>{form.id ? 'New password (leave blank to keep)' : 'Temporary password (8+ characters)'}</span><input className="inp" id="u-pass" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.notify_all} onChange={(e) => setForm({ ...form, notify_all: e.target.checked })} />Alert this user about every guest change (not only their own guests)</label>
            {form.id && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.active} disabled={form.id === me} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Account active</label>}
            {form.id && form.totp && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!form.reset2fa} onChange={(e) => setForm({ ...form, reset2fa: e.target.checked })} />Reset 2-step login (lost phone)</label>}
            <button className="btn pri" disabled={busy}>Save user</button>
          </form>
        </Modal>
      )}

      {roleForm && (
        <Modal title={roleForm.key ? `Edit role · ${roleForm.label}` : 'New role'} onClose={() => setRoleForm(null)} width={620}>
          <form className="stack" onSubmit={saveRole}>
            <label className="field"><span>Role name</span><input className="inp" id="r-name" value={roleForm.label} onChange={(e) => setRoleForm({ ...roleForm, label: e.target.value })} placeholder="e.g. Mess Secretary" required /></label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={roleForm.twofa} onChange={(e) => setRoleForm({ ...roleForm, twofa: e.target.checked })} />Require 2-step login (authenticator code) for this role</label>
            <div className="lbl">Modules ({roleForm.modules.length} ticked)</div>
            <div className="stack" style={{ gap: 6 }}>
              {modules.map((m) => (
                <label key={m.id} className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap', background: roleForm.modules.includes(m.id) ? 'var(--green-soft)' : 'var(--well)', borderRadius: 10, padding: '8px 10px' }}>
                  <input type="checkbox" checked={roleForm.modules.includes(m.id)} onChange={() => toggleMod(m.id)} style={{ width: 20, height: 20, marginTop: 2, flex: 'none', accentColor: '#14a35f' }} />
                  <span><b>{m.label}</b><br /><span className="mu" style={{ fontSize: 13 }}>{m.desc}</span></span>
                </label>
              ))}
            </div>
            {roleForm.key && <p className="mu" style={{ margin: 0, fontSize: 13 }}>Users with this role are signed out once, so their new access applies.</p>}
            <button className="btn pri" disabled={busy}>{roleForm.key ? 'Save role' : 'Create role'}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
