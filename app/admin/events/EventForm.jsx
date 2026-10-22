'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { admin, toast } from '@/components/client';

export default function EventForm({ series }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', series_id: '', venue: '', map_url: '', rsvp_deadline: '', default_extra_cap: 2, card_host: 'The Commanding Officer and all Officers', card_unit: '', card_note: 'Ladies & Children are cordially invited' });
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
          <label className="field"><span>RSVP closes (IST)</span><input className="inp" id="ev-deadline" type="datetime-local" value={f.rsvp_deadline} onChange={set('rsvp_deadline')} /></label>
          <label className="field"><span>Extra guests allowed (default)</span><input className="inp" id="ev-cap" type="number" min="0" max="10" value={f.default_extra_cap} onChange={set('default_extra_cap')} /></label>
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
