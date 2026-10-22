'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { admin, toast } from '@/components/client';
import { sharePdf } from '@/components/sendInvite';
import { CATEGORIES } from '@/lib/consts';

export default function SendQueue({ event, all }) {
  const [kind, setKind] = useState('invite');
  const [mine, setMine] = useState(!all);
  const [category, setCategory] = useState('');
  const [cur, setCur] = useState(null);
  const [skip, setSkip] = useState([]);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);

  const next = async (sk = skip) => {
    setBusy(true);
    try {
      const r = await admin('queue.next', { event_id: event.id, kind, mine, category, skip: sk });
      setCur(r.done ? { done: true } : r);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const opened = async () => {
    try { await admin('inv.markSent', { id: cur.id, kind }); setSent(sent + 1); } catch (e) { toast(e.message, true); }
    setTimeout(() => next(), 400);
  };

  return (
    <>
      <div className="top"><div style={{ flex: 1 }}><div className="lbl">{event.name}</div><h1>Send on WhatsApp</h1></div></div>
      <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
        <div className="row">
          <button type="button" className={`fchip${kind === 'invite' ? ' on' : ''}`} onClick={() => { setKind('invite'); setCur(null); }}>Invitations</button>
          <button type="button" className={`fchip${kind === 'reminder' ? ' on' : ''}`} onClick={() => { setKind('reminder'); setCur(null); }}>Event-day reminder</button>
          {all && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setCur(null); }} />Only guests I look after</label>}
          <select className="inp" aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setCur(null); }} style={{ width: 'auto' }}>
            <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}
          </select>
        </div>
        <p className="mu" style={{ margin: 0, fontSize: 14 }}>
          Each tap opens WhatsApp with the personalised message ready. Press <b>Send</b> in WhatsApp, come back, and the next guest is ready.
          Several coordinators can work at once: each guest is held for 10 minutes by whoever opened it, so nobody gets two messages.
        </p>
        {!cur && <button type="button" className="btn pri" style={{ minHeight: 56, fontSize: 17 }} disabled={busy} onClick={() => next([])}><Icon n="send" />Start</button>}
      </section>

      {cur?.done && <div className="card3 band" style={{ padding: 20 }}><b>All done.</b> <span className="mu">No one is left in this list. {sent ? `You sent ${sent} in this session.` : ''}</span></div>}

      {cur && !cur.done && (
        <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><div className="lbl">Next · {cur.remaining} left · {sent} sent now</div><div className="go" style={{ fontSize: 28 }}>{cur.name}</div><div className="mu num">+{cur.mobile}</div></div>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#faf6ec', borderRadius: 10, padding: 12, margin: 0, fontFamily: 'var(--body)', fontSize: 14, maxHeight: 260, overflow: 'auto' }}>{cur.text}</pre>
          <div className="row">
            <a className="btn pri" style={{ minHeight: 56, fontSize: 17, flex: '1 1 220px' }} href={cur.wa} target="_blank" rel="noopener noreferrer" onClick={opened}><Icon n="wa" size={22} />Open WhatsApp</a>
            {kind === 'invite' && <button type="button" className="btn" onClick={async () => { await sharePdf(cur.id); setSent(sent + 1); next(); }}><Icon n="share" />Share PDF instead</button>}
            <button type="button" className="btn ghost" onClick={() => { const s = [...skip, cur.id]; setSkip(s); next(s); }}>Skip</button>
          </div>
        </section>
      )}
    </>
  );
}
