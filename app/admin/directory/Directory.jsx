'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import { admin, toast } from '@/components/client';
import { CATEGORIES } from '@/lib/consts';

const blank = { category: 'officer', rank: '', name: '', mobile: '', city: '', lang: 'en', notes: '' };

export default function Directory({ people, events }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState(new Set());
  const [ev, setEv] = useState(events[0]?.id || '');
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(150);
  const evName = Object.fromEntries(events.map((e) => [e.id, e.name]));

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return people.filter((p) => (!cat || p.category === cat) && words.every((w) => `${p.rank} ${p.name} ${p.city} ${p.mobile}`.toLowerCase().includes(w)));
  }, [people, q, cat]);
  const run = async (fx, ok) => { setBusy(true); try { await fx(); if (ok) toast(ok); router.refresh(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };

  async function upload(e) {
    e.preventDefault();
    const file = e.target.elements.file.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); if (e.target.elements.event.value) fd.append('event_id', e.target.elements.event.value);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/import', { method: 'POST', headers: { 'x-kl': '1' }, body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setImp(j); router.refresh();
    } catch (er) { toast(er.message, true); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="top">
        <div style={{ flex: 1 }}><div className="lbl">All events</div><h1>Invitee directory</h1><div className="mu">{people.length} people</div></div>
        <button type="button" className="btn pri" onClick={() => setForm({ ...blank })}><Icon n="plus" />Add invitee</button>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <form className="card3 band stack" style={{ padding: '18px 14px 14px' }} onSubmit={upload}>
          <h2 className="go" style={{ fontSize: 22 }}>Import from Excel</h2>
          <p className="mu" style={{ margin: 0, fontSize: 14 }}>1. Download the template, 2. fill one row per invitee, 3. upload. Duplicates (same mobile) are skipped.</p>
          <a className="btn" href="/api/admin/import"><Icon n="dl" />Download template</a>
          <input type="file" name="file" accept=".xlsx" className="inp" required />
          <label className="field"><span>Also invite them to</span>
            <select className="inp" name="event" defaultValue={events[0]?.id || ''}><option value="">Don’t invite yet</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          </label>
          <button className="btn grn" disabled={busy}>Upload</button>
          {imp && <div className={imp.errors.length ? 'err' : 'okmsg'}>{imp.created} added · {imp.skipped} already in directory · {imp.invited} invited{imp.errors.length ? ` · ${imp.errors.length} rows need fixing:` : ''}
            {imp.errors.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontWeight: 400 }}>{imp.errors.slice(0, 12).map((x) => <li key={x.row}>Row {x.row}: {x.msg}</li>)}</ul>}</div>}
        </form>
        <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
          <h2 className="go" style={{ fontSize: 22 }}>Invite to an event</h2>
          <label className="field"><span>Event</span><select className="inp" id="inv-ev" value={ev} onChange={(e) => setEv(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <div className="row">
            <button type="button" className="btn grn" disabled={!ev || !sel.size || busy} onClick={() => run(async () => { const r = await admin('invite.add', { event_id: ev, ids: [...sel] }); toast(`${r.added} invited`); setSel(new Set()); })}>Invite {sel.size || ''} selected</button>
            {CATEGORIES.map((c) => <button key={c.id} type="button" className="btn sm" disabled={!ev || busy} onClick={() => window.confirm(`Invite every ${c.label} in the directory to this event?`) && run(async () => { const r = await admin('invite.add', { event_id: ev, category: c.id }); toast(`${r.added} invited`); })}>All {c.short}</button>)}
          </div>
        </section>
      </div>

      <div className="card3 band" style={{ padding: '14px 12px 10px' }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input className="inp" id="dir-q" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, rank, city, mobile" style={{ flex: '1 1 240px', width: 'auto' }} />
          <select className="inp" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 'auto' }}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}</select>
          <span className="mu">{list.length} shown · {sel.size} selected</span>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: '65vh' }}>
          <table className="tbl">
            <thead><tr><th><input type="checkbox" aria-label="Select all shown" onChange={(e) => setSel(e.target.checked ? new Set(list.map((p) => p.id)) : new Set())} /></th><th>Name</th><th>Category</th><th>Mobile</th><th>City</th><th>Lang</th><th>Invited to</th><th /></tr></thead>
            <tbody>{list.slice(0, limit).map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.has(p.id)} onChange={() => { const s = new Set(sel); s.has(p.id) ? s.delete(p.id) : s.add(p.id); setSel(s); }} /></td>
                <td><b>{[p.rank, p.name].filter(Boolean).join(' ')}</b></td>
                <td>{CATEGORIES.find((c) => c.id === p.category)?.short}</td>
                <td className="num">{p.mobilePretty || '—'}</td><td>{p.city || '—'}</td><td>{p.lang.toUpperCase()}</td>
                <td className="sub">{p.events.map((e) => evName[e]).filter(Boolean).join(', ') || '—'}</td>
                <td><button type="button" className="btn sm" aria-label={`Edit ${p.name}`} onClick={() => setForm({ ...p })}><Icon n="edit" size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {list.length > limit && <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => setLimit(limit + 300)}>Show more</button>}
      </div>

      {form && (
        <Modal title={form.id ? 'Edit invitee' : 'Add invitee'} onClose={() => setForm(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await admin('invitee.save', { ...form, event_id: form.id ? undefined : form.event_id }); setForm(null); }, 'Saved'); }}>
            <div className="grid2">
              <label className="field"><span>Category</span><select className="inp" id="p-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              <label className="field"><span>Rank</span><input className="inp" id="p-rank" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} placeholder="Col / Hav (Retd) / Smt" /></label>
            </div>
            <label className="field"><span>Name (English letters)</span><input className="inp" id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <div className="grid2">
              <label className="field"><span>Mobile</span><input className="inp" id="p-mob" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} inputMode="tel" placeholder="98XXXXXXXX" /></label>
              <label className="field"><span>City</span><input className="inp" id="p-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
              <label className="field"><span>Message language</span><select className="inp" id="p-lang" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })}><option value="en">English</option><option value="hi">Hindi</option><option value="ne">Nepali</option></select></label>
              {!form.id && <label className="field"><span>Invite to</span><select className="inp" id="p-ev" value={form.event_id || ''} onChange={(e) => setForm({ ...form, event_id: e.target.value })}><option value="">Not yet</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}
            </div>
            <label className="field"><span>Notes</span><input className="inp" id="p-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button className="btn pri" disabled={busy}>Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}
