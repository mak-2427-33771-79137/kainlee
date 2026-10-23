'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { admin, toast } from '@/components/client';
import DateTimeField from '@/components/DateTimeField';

export default function EventForm({ series }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', series_id: '', venue: '', map_url: '', rsvp_deadline: '', default_extra_cap: 2, card_host: 'The Commanding Officer and all Officers', card_unit: '', card_note: 'Ladies & Children are cordially invited', guestroom_enabled: true, diet_notes_enabled: false });
  const [sname, setSname] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await admin('event.save', f);
      toast('Event created. Now add its functions.');
      router.push(`/admin/e/${r.id}/settings`);
    } catch (er) { toast(er.message, true); } finally { setBusy(false); }
  }
  async function addSeries(e) {
    e.preventDefault();
    try { await admin('series.save', { name: sname }); setSname(''); toast('Series added'); router.refresh(); } catch (er) { toast(er.message, true); }
  }

  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <form onSubmit={create} className="card3 band stack" style={{ padding: '22px 18px 18px' }}>
        <h2 className="go" style={{ fontSize: 24 }}>New event</h2>
        <label className="field"><span>Event name</span><input className="inp" id="ev-name" value={f.name} onChange={set('name')} placeholder="Regimental Get-Together 2026" required /></label>
        <label className="field"><span>Part of a series (optional)</span>
          <select className="inp" id="ev-series" value={f.series_id} onChange={set('series_id')}><option value="">None</option>{series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <div className="grid2">
          <label className="field"><span>Main venue</span><input className="inp" id="ev-venue" value={f.venue} onChange={set('venue')} placeholder="Officers' Mess" /></label>
          <label className="field"><span>Google Maps link</span><input className="inp" id="ev-map" value={f.map_url} onChange={set('map_url')} placeholder="https://maps.app.goo.gl/…" /></label>
          <DateTimeField id="ev-deadline" label="RSVP closes (IST)" value={f.rsvp_deadline} onChange={(v) => setF({ ...f, rsvp_deadline: v })} />
          <label className="field"><span>Extra guests allowed (default)</span><input className="inp" id="ev-cap" type="number" min="0" max="10" value={f.default_extra_cap} onChange={set('default_extra_cap')} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', background: 'var(--well)', borderRadius: 10, padding: '10px 12px' }}>
          <div><b>Guest rooms</b><div className="mu" style={{ fontSize: 13 }}>{f.guestroom_enabled ? 'On: officers can request guest rooms with ETA / ETD.' : 'Off: guests are not asked about guest rooms.'}</div></div>
          <button type="button" className="tog" id="ev-gr" aria-pressed={!!f.guestroom_enabled} aria-label="Guest rooms for this event" onClick={() => setF({ ...f, guestroom_enabled: !f.guestroom_enabled })}><i /></button>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', background: 'var(--well)', borderRadius: 10, padding: '10px 12px' }}>
          <div><b>Dietary notes</b><div className="mu" style={{ fontSize: 13 }}>{f.diet_notes_enabled ? 'On: each guest can add a dietary note (e.g. Jain, no egg).' : 'Off: the dietary note box is hidden for everyone.'}</div></div>
          <button type="button" className="tog" id="ev-diet" aria-pressed={!!f.diet_notes_enabled} aria-label="Dietary notes for this event" onClick={() => setF({ ...f, diet_notes_enabled: !f.diet_notes_enabled })}><i /></button>
        </div>
        <button className="btn pri" disabled={busy}>Create event</button>
      </form>
      <form onSubmit={addSeries} className="card3 band stack" style={{ padding: '22px 18px 18px' }}>
        <h2 className="go" style={{ fontSize: 24 }}>Series</h2>
        <p className="mu" style={{ margin: 0 }}>Group several events (e.g. “Raising Day 2026” with its Barakhana, Sainik Sammelan and Dinner) so they can share one invitation card design.</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{series.map((s) => <li key={s.id}>{s.name}</li>)}{!series.length && <li className="mu">No series yet</li>}</ul>
        <label className="field"><span>New series name</span><input className="inp" id="series-name" value={sname} onChange={(e) => setSname(e.target.value)} required /></label>
        <button className="btn">Add series</button>
      </form>
    </div>
  );
}
