'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import March from '@/components/March';
import { admin, toast } from '@/components/client';
import { isNative, nativeScan, haptic, scannerStatus } from '@/components/native';
import { BUILD } from '@/lib/version';
import { checkinCall, refreshSnapshot, syncNow, subscribe } from '@/components/offline';
import { RELATION_LABEL, AGE_LABEL, RELATIONS, AGE_GROUPS } from '@/lib/consts';

export default function Checkin({ event, functions, defaultFn, ownOnly, me }) {
  const [fn, setFn] = useState(defaultFn);
  const [stats, setStats] = useState({ expected: 0, present: 0 });
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [party, setParty] = useState(null);
  const [scan, setScan] = useState(false);
  const [diag, setDiag] = useState(null);
  useEffect(() => { scannerStatus().then(setDiag).catch(() => {}); }, []);
  const [admitted, setAdmitted] = useState(false);
  const [walk, setWalk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [net, setNet] = useState({ online: true, pending: 0 });
  const ci = useCallback((action, data) => checkinCall(action, data, event.id), [event.id]);

  // keep this event's guest list on the device for offline use; refresh every 5 minutes
  useEffect(() => subscribe(setNet), []);
  useEffect(() => {
    const go = async () => { if (navigator.onLine !== false) { await syncNow(); await refreshSnapshot(event.id); } };
    go();
    const t = setInterval(() => !document.hidden && go(), 300000);
    window.addEventListener('online', go);
    return () => { clearInterval(t); window.removeEventListener('online', go); };
  }, [event.id]);

  const loadStats = useCallback(async () => { if (fn) try { setStats(await ci('checkin.stats', { function_id: fn })); } catch {} }, [fn, ci]);
  useEffect(() => { loadStats(); const t = setInterval(() => !document.hidden && loadStats(), 15000); return () => clearInterval(t); }, [loadStats]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => { try { setResults((await ci('checkin.search', { event_id: event.id, q })).results); } catch (e) { toast(e.message, true); } }, 250);
    return () => clearTimeout(t);
  }, [q, event.id, ci]);

  const open = async (id) => {
    try { setParty(await ci('checkin.party', { id })); setAdmitted(false); setResults([]); setQ(''); } catch (e) { toast(e.message, true); }
  };
  const onCode = async (raw) => {
    setScan(false);
    const code = String(raw || '').trim();
    if (!/^KLN-/i.test(code)) { haptic(false); toast('This QR is not a Kainlee entry pass. Scan the QR on the guest’s card or entry pass.', true); return; }
    try { const r = await ci('checkin.lookup', { code, event_id: event.id }); await open(r.id); haptic(true); if (navigator.vibrate) navigator.vibrate(60); } catch (e) { haptic(false); toast(e.message, true); }
  };
  const mark = async (m, status) => {
    const cur = m.fn[fn]?.attendance;
    const next = cur === status ? null : status;
    setParty((p) => ({ ...p, members: p.members.map((x) => (x.id === m.id ? { ...x, fn: { ...x.fn, [fn]: { ...(x.fn[fn] || {}), attendance: next } } } : x)) }));
    try { await ci('checkin.mark', { member_id: m.id, function_id: fn, status: next }); loadStats(); } catch (e) { toast(e.message, true); open(party.id); }
  };
  const allIn = async () => {
    setBusy(true);
    for (const m of party.members) if (m.fn[fn]?.attendance !== 'present') await ci('checkin.mark', { member_id: m.id, function_id: fn, status: 'present' }).catch(() => {});
    await open(party.id); setBusy(false); loadStats();
  };
  const done = () => {
    if (!admitted) { setAdmitted(true); return; }
    setParty(null); setAdmitted(false);
  };
  const fnObj = functions.find((f) => f.id === fn);
  const expected = party ? party.members.filter((m) => m.fn[fn]?.attending && !m.is_walkin).length : 0;

  return (
    <>
      <div className="top">
        <div style={{ flex: 1, minWidth: 200 }}><div className="lbl">{event.name} · {me}{ownOnly ? ' · your guests only' : ''}</div><h1>Gate check-in</h1></div>
        <div className="card3" style={{ padding: '8px 16px', textAlign: 'right' }}>
          <div className="lbl">Present</div>
          <div className="go" style={{ fontSize: 34, color: 'var(--red)' }}><span className="num">{stats.present}</span> <span className="mu" style={{ fontFamily: 'var(--body)', fontSize: 16, fontWeight: 400 }}>/ {stats.expected}</span></div>
        </div>
      </div>
      {(!net.online || net.pending > 0) && (
        <div className={net.online ? 'okmsg' : 'err'} role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{net.online
            ? `${net.pending} mark(s) made offline${net.syncing ? ' are being sent…' : ' are waiting to be sent.'}`
            : `No connection. Check-in keeps working from the guest list saved on this device${net.pending ? `; ${net.pending} mark(s) will be sent automatically when back online` : ''}.`}</span>
          {net.online && net.pending > 0 && <button type="button" className="btn sm" onClick={() => syncNow().then(() => { loadStats(); if (party) open(party.id); })}>Send now</button>}
        </div>
      )}
      <div className="row">
        {functions.map((f) => <button key={f.id} type="button" className={`fchip${fn === f.id ? ' on' : ''}`} onClick={() => setFn(f.id)}>{f.name} · {f.when}</button>)}
      </div>

      <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))' }}>
        <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
          <button type="button" className="btn pri" style={{ minHeight: 64, fontSize: 18 }} onClick={async () => {
            if (isNative() && !scan) {
              const r = await nativeScan();
              if (r.code) { onCode(r.code); return; }
              if (r.cancelled) return;
              if (r.denied) { toast(r.error, true); return; }
              // native scanner missing (older app) or failed: say why, then use the in-page camera
              if (!r.missing) toast(`App scanner: ${r.error}. Using the page camera instead.`, true);
            }
            setScan(!scan);
          }}><Icon n="scan" size={26} />{scan ? 'Close camera' : 'Scan entry QR'}</button>
          {scan && <Scanner onCode={onCode} />}
          {diag && (diag.bridge || diag.inApp) && (
            <div className="mu" style={{ fontSize: 12.5 }}>
              {!diag.bridge ? 'App link: not connected (scanner uses the page camera)'
                : diag.scanner ? `App scanner: ready${diag.camera === 'denied' ? ' · camera access is off in iPhone Settings › Kainlee' : ''}`
                : 'App scanner: not in this app version. Update Kainlee from TestFlight.'} · Version {BUILD}
            </div>
          )}
          <label className="field"><span>Or search name, rank, city, mobile</span>
            <input className="inp" id="ci-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Gurung" style={{ fontSize: 17 }} autoComplete="off" />
          </label>
          {results.map((r) => (
            <button key={r.id} type="button" onClick={() => open(r.id)} className="row" style={{ justifyContent: 'space-between', border: 0, borderBottom: '1px solid var(--rule)', background: 'none', padding: '10px 4px', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              <span><b>{r.name}</b><br /><span className="mu" style={{ fontSize: 13 }}>{r.city || ''} {r.rsvp === 'declined' ? '· regret' : r.rsvp === 'pending' ? '· no reply' : ''}</span></span>
              <span className="btn sm">Open</span>
            </button>
          ))}
        </section>

        {party ? (
          <section className="card3 stack" style={{ padding: '20px 18px 16px', position: 'relative', boxShadow: '0 0 0 6px var(--green),0 0 0 12px var(--red),0 0 0 18px var(--green),0 26px 34px -12px rgba(0,0,0,.4)', margin: 18, transform: 'perspective(1400px) rotateY(-2deg)' }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <img src="/api/logo/192" alt="" width={50} height={50} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="go" style={{ fontSize: 28 }}>{party.name}</div>
                <div className="mu" style={{ fontSize: 14 }}>{party.city || ''} · {expected} expected at {fnObj?.name}</div>
              </div>
            </div>
            {party.members.map((m) => {
              const st = m.fn[fn]?.attendance;
              return (
                <div key={m.id} className="mem">
                  <div><b style={{ fontSize: 17 }}>{m.name}</b><div className="mu" style={{ fontSize: 13.5 }}>{RELATION_LABEL[m.relation]} · {AGE_LABEL[m.age_group]} · {m.meal === 'veg' ? 'Veg' : 'Non-veg'}{m.is_walkin ? ' · walk-in' : ''}{!m.fn[fn]?.attending && !m.is_walkin ? ' · not on RSVP' : ''}</div></div>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <button type="button" className="key" style={{ width: 'auto', padding: '0 12px', color: st === 'present' ? '#fff' : 'var(--accent)', fontWeight: 800, height: 44 }} aria-pressed={st === 'present'} onClick={() => mark(m, 'present')}>Present</button>
                    <button type="button" className="key abs" style={{ width: 'auto', padding: '0 12px', color: st === 'absent' ? '#fff' : 'var(--red-text)', borderColor: 'var(--red)', fontWeight: 800, height: 44 }} aria-pressed={st === 'absent'} onClick={() => mark(m, 'absent')}>Absent</button>
                  </div>
                </div>
              );
            })}
            <div className="row" style={{ marginTop: 6, minHeight: admitted ? 64 : 0, alignItems: 'flex-end' }}>
              <button type="button" className="btn" hidden={admitted} onClick={() => setWalk({ name: '', relation: 'other', age_group: 'adult' })}><Icon n="plus" />Walk-in</button>
              <button type="button" className="btn" hidden={admitted} disabled={busy} onClick={allIn}>All present</button>
              <button type="button" className="btn pri" style={{ marginLeft: 'auto' }} onClick={done}>{admitted ? 'Next guest →' : 'Done · Admit'}</button>
            </div>
            {admitted && <div style={{ position: 'absolute', left: 22, bottom: 14, pointerEvents: 'none' }}><span className="stamp">ADMITTED<span style={{ display: 'block', fontFamily: 'var(--body)', fontSize: 12, letterSpacing: '.12em' }}>{fnObj?.name?.toUpperCase()}</span></span></div>}
            {walk && (
              <form className="stack" style={{ background: 'var(--well-red)', borderRadius: 10, padding: 12 }} onSubmit={async (e) => {
                e.preventDefault();
                try { await admin('checkin.walkin', { event_id: event.id, function_id: fn, invitation_id: party.id, ...walk }); toast('Walk-in added and marked present'); setWalk(null); open(party.id); loadStats(); } catch (er) { toast(er.status ? er.message : 'Walk-ins need a connection. Note the name and add them when back online.', true); }
              }}>
                <b>Add walk-in to this party</b>
                <label className="field"><span>Name (English letters)</span><input className="inp" id="wk-name" value={walk.name} onChange={(e) => setWalk({ ...walk, name: e.target.value })} required /></label>
                <div className="grid2">
                  <label className="field"><span>Relation</span><select className="inp" id="wk-rel" value={walk.relation} onChange={(e) => setWalk({ ...walk, relation: e.target.value })}>{RELATIONS.filter((r) => r !== 'self').map((r) => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}</select></label>
                  <label className="field"><span>Age</span><select className="inp" id="wk-age" value={walk.age_group} onChange={(e) => setWalk({ ...walk, age_group: e.target.value })}>{AGE_GROUPS.map((a) => <option key={a} value={a}>{AGE_LABEL[a]}</option>)}</select></label>
                </div>
                <div className="row"><button className="btn grn">Add &amp; mark present</button><button type="button" className="btn ghost" onClick={() => setWalk(null)}>Cancel</button></div>
              </form>
            )}
          </section>
        ) : (
          <section className="card3 band stack" style={{ padding: '22px 16px', alignItems: 'center', textAlign: 'center' }}>
            <img className="coin" src="/api/logo/192" alt="" width={90} height={90} />
            <p className="mu" style={{ margin: 0 }}>Scan a guest’s entry QR or search their name. Their family appears here to mark present.</p>
            <div style={{ width: '100%' }}><March squads={2} men={3} height={38} duration={14} width="520px" /></div>
          </section>
        )}
      </div>
    </>
  );
}

function Scanner({ onCode }) {
  const video = useRef(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream, raf, stop = false;
    let detector = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = video.current;
        v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('autoplay', '');
        v.srcObject = stream;
        try { await v.play(); } catch { /* iOS can refuse play() before the first frame; the loop waits for frames */ }
        if ('BarcodeDetector' in window) {
          try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
        }
        const jsQR = detector ? null : (await import('jsqr')).default;
        const c = document.createElement('canvas'); const ctx = c.getContext('2d', { willReadFrequently: true });
        const loop = async () => {
          if (stop) return;
          if (v.readyState >= 2) {
            try {
              if (detector) {
                const codes = await detector.detect(v);
                const hit = codes.find((x) => /^KLN-/i.test(x.rawValue));
                if (hit) { stop = true; cb.current(hit.rawValue); return; }
              } else {
                const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 360;
                c.width = w; c.height = h; ctx.drawImage(v, 0, 0, w, h);
                const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
                if (r && /^KLN-/i.test(r.data)) { stop = true; cb.current(r.data); return; }
              }
            } catch {}
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setErr(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow camera access for this site (in the app: iPhone Settings › Kainlee › Camera).' : !navigator.mediaDevices?.getUserMedia ? 'This browser cannot open the camera. Use search instead.' : `Camera could not start (${e?.name || e}). Use search instead.`);
      }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#050b08', aspectRatio: '4/3' }}>
      <video ref={video} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: '58%', aspectRatio: '1', transform: 'translate(-50%,-50%)', border: '4px solid var(--red)', borderRadius: 16, boxShadow: '0 0 0 2000px rgba(0,0,0,.35)' }} />
      {err && <div className="err" style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>{err}</div>}
    </div>
  );
}
