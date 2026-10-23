'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import CardView from '@/components/CardView';
import DateTimeField from '@/components/DateTimeField';
import { admin, toast } from '@/components/client';

const TPL_KEYS = [['invite_en', 'Invite · English'], ['invite_hi', 'Invite · Hindi'], ['invite_ne', 'Invite · Nepali'], ['reminder_en', 'Reminder · English'], ['reminder_hi', 'Reminder · Hindi'], ['reminder_ne', 'Reminder · Nepali']];

export default function EventSetup({ ev, functions, series, templates, placeholders, cardPlaceholders, defaultCard, canDelete }) {
  const router = useRouter();
  const [f, setF] = useState(ev);
  const [busy, setBusy] = useState(false);
  const [fn, setFn] = useState(null);
  const [tpl, setTpl] = useState(templates);
  const [tk, setTk] = useState('invite_en');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const run = async (fx, ok) => { setBusy(true); try { await fx(); if (ok) toast(ok); router.refresh(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };

  // card editor
  const sr = series.find((s) => String(s.id) === String(f.series_id));
  const [mode, setMode] = useState(ev.card_mode);
  const [html, setHtml] = useState(ev.card_mode === 'series' ? (sr?.card_html || defaultCard) : (ev.card_html || defaultCard));
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (mode === 'builtin') { setPreview(''); }
    const src = mode === 'builtin' ? defaultCard : html;
    const t = setTimeout(async () => { try { setPreview((await admin('card.preview', { event_id: ev.id, html: src })).html); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [html, mode, ev.id, defaultCard]);

  return (
    <>
      <div className="top"><div style={{ flex: 1 }}><div className="lbl">Event setup</div><h1>{ev.name}</h1></div></div>

      <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))' }}>
        <form className="card3 band stack" style={{ padding: '20px 16px 16px' }} onSubmit={(e) => { e.preventDefault(); run(() => admin('event.save', f), 'Event saved'); }}>
          <h2 className="go" style={{ fontSize: 24 }}>Details</h2>
          <label className="field"><span>Name</span><input className="inp" id="e-name" value={f.name} onChange={set('name')} required /></label>
          <label className="field"><span>Link code (short, used in guest links)</span>
            <input className="inp" id="e-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} maxLength={24} placeholder="rgt26" />
            <span className="mu" style={{ fontSize: 12.5, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>Guest links look like …/i/<b>{f.code || 'code'}</b>/9233002887. Changing it changes every guest link for this event, so set it before sending invites.</span>
          </label>
          <div className="grid2">
            <label className="field"><span>Series</span><select className="inp" id="e-series" value={f.series_id} onChange={set('series_id')}><option value="">None</option>{series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field"><span>Status</span><select className="inp" id="e-status" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="draft">Draft</option><option value="closed">Closed (RSVP locked)</option></select></label>
            <label className="field"><span>Main venue</span><input className="inp" id="e-venue" value={f.venue} onChange={set('venue')} /></label>
            <label className="field"><span>Google Maps link</span><input className="inp" id="e-map" value={f.map_url} onChange={set('map_url')} placeholder="https://…" /></label>
            <DateTimeField id="e-start" label="Event date & time (IST)" value={f.starts_at} onChange={(v) => setF({ ...f, starts_at: v })} />
            <DateTimeField id="e-deadline" label="RSVP closes (IST)" value={f.rsvp_deadline} onChange={(v) => setF({ ...f, rsvp_deadline: v })} />
            <label className="field"><span>Extra guests allowed</span><input className="inp" id="e-cap" type="number" min="0" max="10" value={f.default_extra_cap} onChange={set('default_extra_cap')} /></label>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', background: 'var(--well)', borderRadius: 10, padding: '10px 12px' }}>
            <div><b>Guest rooms</b><div className="mu" style={{ fontSize: 13 }}>{f.guestroom_enabled ? 'On: officers can request guest rooms with ETA / ETD.' : 'Off: guests are not asked about guest rooms.'}</div></div>
            <button type="button" className="tog" id="e-gr" aria-pressed={!!f.guestroom_enabled} aria-label="Guest rooms for this event" onClick={() => setF({ ...f, guestroom_enabled: !f.guestroom_enabled })}><i /></button>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', background: 'var(--well)', borderRadius: 10, padding: '10px 12px' }}>
            <div><b>Dietary notes</b><div className="mu" style={{ fontSize: 13 }}>{f.diet_notes_enabled ? 'On: each guest can add a dietary note (e.g. Jain, no egg).' : 'Off: the dietary note box is hidden for everyone.'}</div></div>
            <button type="button" className="tog" id="e-diet" aria-pressed={!!f.diet_notes_enabled} aria-label="Dietary notes for this event" onClick={() => setF({ ...f, diet_notes_enabled: !f.diet_notes_enabled })}><i /></button>
          </div>
          <div className="lbl" style={{ marginTop: 4 }}>Automatic WhatsApp messages (Xpressbot)</div>
          {[
            ['wa_reminders', 'Reply reminders', 'To guests who have not replied: 3 days and 1 day before the RSVP deadline (0900–2000 hrs).'],
            ['wa_confirm', 'Reply confirmation', 'When a guest saves their reply: “We have noted: attending, 3 persons”.'],
            ['wa_eventday', 'Event-day reminder', 'At 0700 hrs on each function day, to families coming: time, venue, directions and invitation link.'],
          ].map(([key, title, desc]) => (
            <div key={key} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', background: 'var(--well)', borderRadius: 10, padding: '10px 12px' }}>
              <div><b>{title}</b><div className="mu" style={{ fontSize: 13 }}>{desc}</div></div>
              <button type="button" className="tog" id={`e-${key}`} aria-pressed={!!f[key]} aria-label={title} onClick={() => setF({ ...f, [key]: !f[key] })}><i /></button>
            </div>
          ))}
          <span className="mu" style={{ fontSize: 12.5 }}>These need WhatsApp automation switched on in Settings. Invitations are sent from Send invites.</span>
          <div className="lbl">Invitation card wording</div>
          <label className="field"><span>Host line</span><input className="inp" id="e-host" value={f.card_host} onChange={set('card_host')} placeholder="The Commanding Officer and all Officers" /></label>
          <label className="field"><span>Unit line</span><input className="inp" id="e-unit" value={f.card_unit} onChange={set('card_unit')} placeholder="Kainlee" /></label>
          <label className="field"><span>Footer note</span><input className="inp" id="e-note" value={f.card_note} onChange={set('card_note')} placeholder="Ladies & Children are cordially invited" /></label>
          <button className="btn pri" disabled={busy}>Save details</button>
        </form>

        <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
          <h2 className="go" style={{ fontSize: 24 }}>Functions</h2>
          {functions.map((x) => (
            <div key={x.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px dashed var(--rule2)', paddingBottom: 8 }}>
              <span><b>{x.name}</b><br /><span className="mu" style={{ fontSize: 13.5 }}>{x.starts_at.replace('T', ' at ')} · {x.venue || f.venue || 'venue —'}{x.dress ? ` · Dress: ${x.dress}` : ''}</span></span>
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="btn sm" onClick={() => setFn({ ...x })}><Icon n="edit" size={15} />Edit</button>
                <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} onClick={() => window.confirm(`Delete ${x.name}? RSVPs and attendance for it will be lost.`) && run(() => admin('function.delete', { id: x.id }), 'Deleted')}>Delete</button>
              </span>
            </div>
          ))}
          {!functions.length && <p className="mu" style={{ margin: 0 }}>Add each part of the event, e.g. Barakhana on 14 Nov at 1230 hrs, Ladies’ Dinner Night on 15 Nov at 2000 hrs.</p>}
          {fn ? (
            <form className="stack" style={{ background: 'var(--well)', borderRadius: 10, padding: 12 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await admin('function.save', { event_id: ev.id, ...fn }); setFn(null); }, 'Function saved'); }}>
              <div className="grid2">
                <label className="field"><span>Name</span><input className="inp" id="f-name" value={fn.name} onChange={(e) => setFn({ ...fn, name: e.target.value })} required placeholder="Barakhana" /></label>
                <DateTimeField id="f-at" label="Date & time (IST)" value={fn.starts_at} onChange={(v) => setFn({ ...fn, starts_at: v })} />
                <label className="field"><span>Venue (if different)</span><input className="inp" id="f-venue" value={fn.venue} onChange={(e) => setFn({ ...fn, venue: e.target.value })} /></label>
                <label className="field"><span>Dress</span><input className="inp" id="f-dress" value={fn.dress} onChange={(e) => setFn({ ...fn, dress: e.target.value })} placeholder="Open Collar" /></label>
                <label className="field" style={{ gridColumn: '1/-1' }}><span>Maps link (if different)</span><input className="inp" id="f-map" value={fn.map_url} onChange={(e) => setFn({ ...fn, map_url: e.target.value })} /></label>
              </div>
              <div className="row"><button className="btn pri" disabled={busy}>Save function</button><button type="button" className="btn ghost" onClick={() => setFn(null)}>Cancel</button></div>
            </form>
          ) : <button type="button" className="btn" onClick={() => setFn({ name: '', starts_at: '', venue: '', map_url: '', dress: '' })}><Icon n="plus" />Add function</button>}
        </section>
      </div>

      <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
        <h2 className="go" style={{ fontSize: 24 }}>Invitation card</h2>
        <div className="row">
          <button type="button" className={`fchip${mode === 'builtin' ? ' on' : ''}`} onClick={() => setMode('builtin')}>Standard regimental card</button>
          <button type="button" className={`fchip${mode === 'event' ? ' on' : ''}`} onClick={() => { setMode('event'); setHtml(ev.card_html || defaultCard); }}>Custom HTML · this event</button>
          <button type="button" className={`fchip${mode === 'series' ? ' on' : ''}`} disabled={!f.series_id} onClick={() => { setMode('series'); setHtml(sr?.card_html || defaultCard); }} title={f.series_id ? '' : 'Put this event in a series first'}>Custom HTML · whole series{sr ? ` (${sr.name})` : ''}</button>
        </div>
        <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))' }}>
          <div className="stack">
            {mode === 'builtin' ? (
              <p className="mu" style={{ margin: 0 }}>The standard card uses the regimental colour bands, crest and the wording above. The PDF sent on WhatsApp is drawn from it. Choose a custom HTML card to design your own.</p>
            ) : (<>
              <label className="field"><span>Card HTML (960 × 540 canvas; &lt;style&gt; allowed, scripts removed)</span>
                <textarea className="inp" id="card-html" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} style={{ minHeight: 360, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 12.5, lineHeight: 1.45 }} />
              </label>
              <details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Placeholders you can use</summary>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5 }}>{cardPlaceholders.map(([p, d]) => <li key={p}><code>{p}</code> {d}</li>)}</ul>
              </details>
              <div className="row"><button type="button" className="btn ghost" onClick={() => setHtml(defaultCard)}>Reset to standard design</button></div>
            </>)}
            <button type="button" className="btn pri" disabled={busy} onClick={() => run(() => admin('card.save', mode === 'series' ? { scope: 'series', series_id: f.series_id, event_id: ev.id, html } : { event_id: ev.id, mode, html }), mode === 'series' ? 'Card saved for every event in the series' : 'Card saved')}>Save card</button>
          </div>
          <div className="stack">
            <div className="lbl">Preview (sample guest)</div>
            <div className="scene" style={{ padding: 18 }}><div className="tiltc"><div className="face" style={{ boxShadow: '0 26px 34px -10px rgba(0,0,0,.45)' }}><CardView html={preview} /><div className="gloss" /></div></div></div>
            {mode !== 'builtin' && <p className="mu" style={{ margin: 0, fontSize: 13 }}>With a custom card, the WhatsApp link opens the card page where guests can download it as a PDF.</p>}
          </div>
        </div>
      </section>

      <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
        <h2 className="go" style={{ fontSize: 24 }}>WhatsApp messages</h2>
        <div className="row">{TPL_KEYS.map(([k, l]) => <button key={k} type="button" className={`fchip${tk === k ? ' on' : ''}`} onClick={() => setTk(k)}>{l}</button>)}</div>
        <textarea className="inp" id="tpl-text" value={tpl[tk] || ''} onChange={(e) => setTpl({ ...tpl, [tk]: e.target.value })} style={{ minHeight: 260 }} />
        <details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Placeholders</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5 }}>{placeholders.map(([p, d]) => <li key={p}><code>{p}</code> {d}</li>)}</ul>
        </details>
        <button type="button" className="btn pri" disabled={busy} onClick={() => run(() => admin('templates.save', { event_id: ev.id, templates: tpl }), 'Messages saved')}>Save messages</button>
      </section>

      {canDelete && (
        <section className="card3 stack" style={{ padding: '18px 16px', borderColor: 'var(--red)' }}>
          <h2 className="go" style={{ fontSize: 22, color: 'var(--red-text)' }}>Delete event</h2>
          <p className="mu" style={{ margin: 0 }}>Deletes the event, its functions, RSVPs, rooms and attendance. Invitees stay in the directory. Download a backup first (Settings).</p>
          <button type="button" className="btn" style={{ borderColor: 'rgba(255,110,90,.55)', color: 'var(--red-text)', boxShadow: 'none', alignSelf: 'flex-start' }} onClick={() => {
            const c = window.prompt(`Type the event name to confirm:\n${ev.name}`);
            if (c) run(async () => { await admin('event.delete', { id: ev.id, confirm: c }); location.href = '/admin/events'; }, 'Event deleted');
          }}>Delete this event</button>
        </section>
      )}
    </>
  );
}
