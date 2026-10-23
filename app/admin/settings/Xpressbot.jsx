'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { admin, toast } from '@/components/client';

// Settings › WhatsApp automation (Xpressbot). The API key is write-only: the page never receives it back.
export default function Xpressbot() {
  const [s, setS] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [tpl, setTpl] = useState({});
  const [open, setOpen] = useState('');
  const [test, setTest] = useState({ kind: 'invite', to: '' });
  const [adv, setAdv] = useState(false);
  const [base, setBase] = useState('');
  const load = (st) => { setS(st); setTpl(st.chosen); setBase(st.base === st.defaultBase ? '' : st.base); };
  useEffect(() => { admin('xb.state').then(load).catch((e) => toast(e.message, true)); }, []);
  const run = async (label, fx, ok) => { setBusy(label); try { const r = await fx(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); return null; } finally { setBusy(''); } };
  if (!s) return <section className="card3 band" style={{ padding: 18 }}>Loading WhatsApp automation…</section>;

  const approved = s.templates.filter((t) => !t.status || t.status === 'approved');
  const names = [...new Set(approved.map((t) => t.name))];
  const copy = (txt) => navigator.clipboard?.writeText(txt).then(() => toast('Copied')).catch(() => toast('Select the text and copy it', true));

  return (
    <section className="card3 band stack" style={{ padding: '18px 14px 14px', gap: 14 }} id="whatsapp">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 10 }}>
        <div>
          <h2 className="go" style={{ fontSize: 22, margin: 0 }}>WhatsApp automation (Xpressbot)</h2>
          <p className="mu" style={{ margin: '4px 0 0', fontSize: 14 }}>Send invitations, reminders, reply confirmations and event-day passes from your WhatsApp Business number automatically.</p>
        </div>
        <span className={`chip ${s.enabled ? 'att' : 'gray'}`} style={{ flex: 'none' }}>{s.enabled ? 'On' : 'Off'}</span>
      </div>

      {/* 1. API key */}
      <div className="xb-step">
        <div className="xb-n">1</div>
        <div className="stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          <b>API key</b>
          <span className="mu" style={{ fontSize: 13.5 }}>In Xpressbot open <b>Developer Portal › API Keys</b>, press <b>Generate API Key</b>, copy it and paste it here. It is shown only once there, and is never shown again here.</span>
          {s.hasKey && <span className="mu" style={{ fontSize: 13.5 }}>Saved key ending <b className="num">••••{s.keyEnd}</b></span>}
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <input className="inp" id="xb-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.hasKey ? 'Paste a new key to replace it' : 'Paste the API key'} style={{ flex: 1 }} />
            <button type="button" className="btn pri" disabled={!key.trim() || !!busy} onClick={async () => { const r = await run('key', () => admin('xb.save', { key }), 'Key saved'); if (r) { load(r); setKey(''); } }}>Save</button>
          </div>
          <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAdv(!adv)}>{adv ? 'Hide' : 'Advanced'}</button>
          {adv && (
            <div className="stack" style={{ gap: 8 }}>
              <label className="field"><span>API address (leave blank for {s.defaultBase})</span><input className="inp" id="xb-base" value={base} onChange={(e) => setBase(e.target.value)} placeholder={s.defaultBase} /></label>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm" disabled={!!busy} onClick={async () => { const r = await run('base', () => admin('xb.save', { base }), 'Saved'); if (r) load(r); }}>Save address</button>
                {s.hasKey && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} disabled={!!busy} onClick={async () => { const r = await run('rm', () => admin('xb.save', { removeKey: true }), 'Key removed, automation off'); if (r) load(r); }}>Remove key</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Test connection */}
      <div className="xb-step">
        <div className="xb-n">2</div>
        <div className="stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          <b>Check the connection</b>
          <span className="mu" style={{ fontSize: 13.5 }}>Finds your WhatsApp number and the templates Meta has approved.</span>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!s.hasKey || !!busy} onClick={async () => { const r = await run('test', () => admin('xb.test'), 'Connected'); if (r) load(r); }}>
            <Icon n="check" size={16} />{busy === 'test' ? 'Checking…' : 'Test connection'}
          </button>
          {s.channelLabel && <span style={{ fontSize: 14 }}>Number: <b>{s.channelLabel}</b></span>}
          {s.templates.length > 0 && <span className="mu" style={{ fontSize: 13.5 }}>{approved.length} approved template(s): {names.join(', ')}</span>}
        </div>
      </div>

      {/* 3. Templates */}
      <div className="xb-step">
        <div className="xb-n">3</div>
        <div className="stack" style={{ gap: 10, minWidth: 0, flex: 1 }}>
          <b>Templates</b>
          <span className="mu" style={{ fontSize: 13.5 }}>Create these in Xpressbot (<b>WhatsApp › Templates</b>, category Utility) with this wording, then pick each one here. Meta approves them, usually within a day.</span>
          {Object.entries(s.kinds).map(([kind, label]) => {
            const t = s.texts[kind];
            const missing = names.length && tpl[kind] && !names.includes(tpl[kind]);
            return (
              <div key={kind} className="xb-tpl">
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 14.5 }}>{label}</b>
                  <button type="button" className="btn ghost sm" onClick={() => setOpen(open === kind ? '' : kind)}>{open === kind ? 'Hide wording' : 'Show wording'}</button>
                </div>
                {names.length ? (
                  <select className="inp" id={`xb-t-${kind}`} value={names.includes(tpl[kind]) ? tpl[kind] : ''} onChange={(e) => setTpl({ ...tpl, [kind]: e.target.value })}>
                    <option value="">Choose a template…</option>
                    {names.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <input className="inp" id={`xb-t-${kind}`} value={tpl[kind] || ''} onChange={(e) => setTpl({ ...tpl, [kind]: e.target.value })} placeholder="Template name" />
                )}
                {missing && <span style={{ fontSize: 13, color: 'var(--red-text)' }}>“{tpl[kind]}” is not approved yet. Pick it once Meta approves it.</span>}
                {open === kind && (
                  <div className="xb-wording">
                    <div className="mu" style={{ fontSize: 12.5 }}>Name: <b className="num">{s.chosen[kind] || kind}</b> · Header: {t.header}</div>
                    <pre>{t.body}</pre>
                    <ol>{t.vars.map((v, i) => <li key={i}><span className="num">{`{{${i + 1}}}`}</span> {v}</li>)}</ol>
                    <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => copy(t.body)}>Copy wording</button>
                  </div>
                )}
              </div>
            );
          })}
          <label className="row" style={{ gap: 8 }}><input type="checkbox" id="xb-img" checked={s.inviteImage} onChange={async (e) => { const r = await run('img', () => admin('xb.save', { inviteImage: e.target.checked })); if (r) load(r); }} style={{ width: 20, height: 20, accentColor: '#14a35f' }} />The invitation template has an image header (the guest’s card is attached)</label>
          <button type="button" className="btn pri" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={async () => { const r = await run('tpl', () => admin('xb.save', { templates: tpl }), 'Templates saved'); if (r) load(r); }}>Save templates</button>
        </div>
      </div>

      {/* 4. Test message */}
      <div className="xb-step">
        <div className="xb-n">4</div>
        <div className="stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          <b>Send a test to your own number</b>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 8 }}>
            <label className="field"><span>Message</span><select className="inp" id="xb-test-kind" value={test.kind} onChange={(e) => setTest({ ...test, kind: e.target.value })}>{Object.entries(s.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>Mobile with country code</span><input className="inp" id="xb-test-to" inputMode="tel" value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} placeholder="919812345678" /></label>
          </div>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!s.hasKey || !test.to || !!busy} onClick={() => run('send', () => admin('xb.testSend', test), 'Test sent. Check WhatsApp on that phone.')}>
            <Icon n="send" size={16} />{busy === 'send' ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>

      {/* 5. On / off */}
      <div className="xb-step">
        <div className="xb-n">5</div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 10, flex: 1 }}>
          <div><b>Send messages through Xpressbot</b><div className="mu" style={{ fontSize: 13.5 }}>Then choose the automatic messages for each event in <b>Event setup</b>, and send invitations from <b>Send invites</b>.</div></div>
          <button type="button" className="tog" id="xb-on" aria-pressed={s.enabled} aria-label="Send messages through Xpressbot" disabled={!!busy || (!s.hasKey && !s.enabled)}
            onClick={async () => { const r = await run('on', () => admin('xb.save', { enabled: !s.enabled }), s.enabled ? 'Turned off' : 'Turned on'); if (r) load(r); }}><i /></button>
        </div>
      </div>
    </section>
  );
}
