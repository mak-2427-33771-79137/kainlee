'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import ExportMenu from '@/components/ExportMenu';
import { admin, toast } from '@/components/client';

function Call({ p }) {
  if (!p.mobile) return null;
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <a className="btn sm" href={`tel:+${p.mobile}`} aria-label={`Call ${p.name}`} title={`Call ${p.mobilePretty}`}><Icon n="phone" size={15} /></a>
      <a className="btn sm" href={`https://wa.me/${p.mobile}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${p.name}`}><Icon n="wa" size={15} /></a>
    </span>
  );
}

export default function Rooms({ event, rooms, waiting, s, manage, exportOk }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', location: '', notes: '' });
  const [bulk, setBulk] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const vacant = rooms.filter((r) => !r.guest);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast(ok); router.refresh(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };

  const tiles = [
    ['Rooms in list', s.total_rooms, ''],
    ['Allotted', s.rooms_allotted, 'var(--green)'],
    ['Vacant', s.vacant, s.vacant ? 'var(--green)' : 'var(--muted)'],
    ['Required', s.rooms_needed, ''],
    ['More required', s.still_needed, s.still_needed ? 'var(--red)' : 'var(--green)'],
    ['Short of rooms', Math.max(0, s.rooms_needed - s.total_rooms), s.rooms_needed > s.total_rooms ? 'var(--red)' : 'var(--green)'],
  ];

  return (
    <>
      <div className="top">
        <div style={{ flex: 1, minWidth: 220 }}><div className="lbl">{event.name}</div><h1>Guest rooms</h1></div>
        {exportOk && <ExportMenu eventId={event.id} reports={[['rooms', 'Guest room report']]} />}
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))' }}>
        {tiles.map(([l, v, c], i) => (
          <div key={l} className="card3 band tilt3 kpi" style={{ animationDelay: `${i * 0.06}s` }}>
            <span className="lbl">{l}</span><span className="big" style={{ color: c || 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>

      {waiting.length > 0 && (
        <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
          <h2 className="go" style={{ fontSize: 24 }}>Officers awaiting rooms <span className="chip dec">{waiting.length}</span></h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Officer</th><th>Call</th><th>Rooms</th><th>ETA</th><th>ETD</th><th>Looked after by</th>{manage && <th>Allot</th>}</tr></thead>
            <tbody>{waiting.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/e/${event.id}/guests/${p.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{p.name}</Link>{p.note && <div className="sub">{p.note}</div>}</td>
                <td><Call p={p} /></td>
                <td className="num"><b>{p.got}</b> of {p.need}</td>
                <td className="num">{p.eta}</td><td className="num">{p.etd}</td>
                <td>{p.handler || <span className="chip pen">Unassigned</span>}</td>
                {manage && <td>{vacant.length ? (
                  <select className="inp" aria-label={`Allot a room to ${p.name}`} disabled={busy} value="" onChange={(e) => e.target.value && run(() => admin('room.allot', { room_id: e.target.value, invitation_id: p.id }), 'Room allotted')} style={{ minHeight: 34, width: 'auto' }}>
                    <option value="">Choose room…</option>
                    {vacant.map((v) => <option key={v.id} value={v.id}>{v.name}{v.location ? ` · ${v.location}` : ''}</option>)}
                  </select>) : <span className="mu">No vacant rooms</span>}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      <section className="card3 band stack" style={{ padding: '18px 14px 14px' }}>
        <h2 className="go" style={{ fontSize: 24 }}>All rooms</h2>
        {rooms.length === 0 && <p className="mu" style={{ margin: 0 }}>No rooms yet. Add the guest rooms you have at hand below.</p>}
        {rooms.length > 0 && (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Room</th><th>Location</th><th>Allotted to</th><th>Call</th><th>ETA</th><th>ETD</th><th>Comment / notes</th>{manage && <th />}</tr></thead>
            <tbody>{rooms.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b></td>
                <td>{r.location || '—'}</td>
                <td>{r.guest ? <Link href={`/admin/e/${event.id}/guests/${r.guest.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{r.guest.name}</Link> : <span className="chip att">VACANT</span>}</td>
                <td>{r.guest && <Call p={r.guest} />}</td>
                <td className="num">{r.guest?.eta || '—'}</td><td className="num">{r.guest?.etd || '—'}</td>
                <td style={{ fontSize: 13.5 }}>{r.guest?.note || r.notes || '—'}</td>
                {manage && <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {r.guest && <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => admin('room.unallot', { room_id: r.id }), `${r.name} is vacant again`)}>Free</button>}
                  <button type="button" className="btn sm" aria-label={`Edit ${r.name}`} onClick={() => setEdit({ ...r })}><Icon n="edit" size={15} /></button>
                  {!r.guest && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} onClick={() => window.confirm(`Delete ${r.name}?`) && run(() => admin('room.delete', { id: r.id }), 'Deleted')}>Delete</button>}
                </span></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {manage && (
        <div className="grid2" style={{ alignItems: 'start' }}>
          <form className="card3 band stack" style={{ padding: '18px 14px 14px' }} onSubmit={(e) => { e.preventDefault(); const data = edit || f; run(async () => { await admin('room.save', { event_id: event.id, ...data }); setF({ name: '', location: '', notes: '' }); setEdit(null); }, edit ? 'Room updated' : 'Room added'); }}>
            <h2 className="go" style={{ fontSize: 22 }}>{edit ? `Edit ${edit.name}` : 'Add a room'}</h2>
            {(() => { const d = edit || f; const set = (k) => (e) => (edit ? setEdit({ ...edit, [k]: e.target.value }) : setF({ ...f, [k]: e.target.value })); return (<>
              <label className="field"><span>Room</span><input className="inp" id="room-name" value={d.name} onChange={set('name')} placeholder="Room 4" required /></label>
              <label className="field"><span>Location</span><input className="inp" id="room-loc" value={d.location} onChange={set('location')} placeholder="Offrs Mess Annexe" /></label>
              <label className="field"><span>Notes</span><input className="inp" id="room-notes" value={d.notes} onChange={set('notes')} placeholder="Double bed, AC, ground floor" /></label>
            </>); })()}
            <div className="row"><button className="btn pri" disabled={busy}>{edit ? 'Save room' : 'Add room'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>}</div>
          </form>
          <form className="card3 band stack" style={{ padding: '18px 14px 14px' }} onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await admin('room.bulk', { event_id: event.id, text: bulk }); setBulk(''); toast(`${r.added} rooms added`); }); }}>
            <h2 className="go" style={{ fontSize: 22 }}>Add many rooms</h2>
            <p className="mu" style={{ margin: 0, fontSize: 14 }}>One room per line: <b>Room, Location, Notes</b>. You can paste straight from Excel.</p>
            <textarea className="inp" id="room-bulk" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Room 1, Offrs Mess Annexe, AC\nRoom 2, Offrs Mess Annexe\nSuite A, Transit Camp Block B'} style={{ minHeight: 130 }} />
            <button className="btn" disabled={busy || !bulk.trim()}>Add rooms</button>
          </form>
        </div>
      )}
    </>
  );
}
