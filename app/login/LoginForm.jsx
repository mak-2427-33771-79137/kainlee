'use client';
import { useState } from 'react';
import { api } from '@/components/client';

export default function LoginForm({ needsSetup, regiment }) {
  const [stage, setStage] = useState(needsSetup ? 'setup' : 'login');
  const [f, setF] = useState({ name: '', username: '', password: '', code: '' });
  const [enrol, setEnrol] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function go(action, extra = {}) {
    setErr(''); setBusy(true);
    try {
      const r = await api('/api/auth', { action, ...extra });
      if (r.stage === 'done') { location.href = '/admin'; return; }
      if (r.stage === 'enrol') { setEnrol(r); setStage('enrol'); }
      if (r.stage === 'totp') setStage('totp');
      setF((x) => ({ ...x, code: '' }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const submit = (e) => {
    e.preventDefault();
    if (stage === 'setup') go('setup', { name: f.name, username: f.username, password: f.password });
    else if (stage === 'login') go('login', { username: f.username, password: f.password });
    else go(stage, { code: f.code });
  };

  return (
    <form onSubmit={submit} className="card3 band" style={{ width: 'min(100%,420px)', padding: '26px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img className="coin" src="/api/logo/192" alt="" width={54} height={54} />
        <div>
          <div className="go" style={{ fontSize: 30 }}>{regiment}</div>
          <div className="mu" style={{ fontSize: 14 }}>
            {stage === 'setup' ? 'First-time setup: create the Super Admin' : stage === 'enrol' ? 'Set up two-step verification' : stage === 'totp' ? 'Two-step verification' : 'Organiser login'}
          </div>
        </div>
      </div>

      {stage === 'setup' && (
        <label className="field"><span>Your name (with rank)</span><input className="inp" id="name" value={f.name} onChange={set('name')} autoComplete="name" required /></label>
      )}
      {(stage === 'setup' || stage === 'login') && (<>
        <label className="field"><span>Username</span><input className="inp" id="username" value={f.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" required /></label>
        <label className="field"><span>Password{stage === 'setup' ? ' (8+ characters)' : ''}</span><input className="inp" id="password" type="password" value={f.password} onChange={set('password')} autoComplete={stage === 'setup' ? 'new-password' : 'current-password'} required /></label>
      </>)}

      {stage === 'enrol' && enrol && (
        <div className="stack" style={{ gap: 10 }}>
          <p style={{ margin: 0 }}>Scan this with <b>Google Authenticator</b> (or any authenticator app), then type the 6-digit code it shows.</p>
          <img src={enrol.qr} alt="Authenticator QR code" width={200} height={200} style={{ alignSelf: 'center', border: '6px solid #fff', boxShadow: '0 0 0 2px var(--green)' }} />
          <p className="mu" style={{ margin: 0, fontSize: 13, wordBreak: 'break-all' }}>Can’t scan? Enter this key: <b>{enrol.secret}</b></p>
        </div>
      )}
      {(stage === 'enrol' || stage === 'totp') && (
        <label className="field"><span>6-digit code</span><input className="inp num" id="code" value={f.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required style={{ fontSize: 24, letterSpacing: '.3em', textAlign: 'center' }} autoFocus /></label>
      )}

      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Please wait…' : stage === 'setup' ? 'Create Super Admin' : stage === 'login' ? 'Log in' : 'Verify'}</button>
      {(stage === 'enrol' || stage === 'totp') && <button type="button" className="btn ghost" onClick={() => { setStage('login'); setErr(''); }}>Back</button>}
    </form>
  );
}
