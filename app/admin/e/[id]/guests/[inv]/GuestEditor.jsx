'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import DateTimeField from '@/components/DateTimeField';
import { admin, toast } from '@/components/client';
import { sendWhatsApp, shareCard, prepareCard } from '@/components/sendInvite';
import { Contact, Allot, PinReset } from '../GuestTable';
import { RELATION_LABEL, AGE_LABEL, RELATIONS, AGE_GROUPS } from '@/lib/consts';

export default function GuestEditor({ event, r, handlers, vacant, canAllot, canReview, assignAll, me, history }) {
  const router = useRouter();
  const [members, setMembers] = useState(r.members);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [gr, setGr] = useState({ required: r.required, rooms: r.rooms_required, eta: r.eta, etd: r.etd });
  const [to, setTo] = useState('');
  const fnIds = event.functions.map((f) => f.id);

  const upd = (i, patch) => { setMembers(members.map((m, j) => (j === i ? { ...m, ...patch } : m))); setDirty(true); };
  const toggleFn = (i, fid) => { const m = members[i]; upd(i, { attending: m.attending.includes(fid) ? m.attending.filter((x) => x !== fid) : [...m.attending, fid] }); };
  const add = () => { setMembers([...members, { name: '', relation: 'spouse', age_group: 'adult', meal: 'veg', meal_note: '', attending: [...fnIds], attendance: {} }]); setDirty(true); };
  const run = async (fn, ok) => { setBusy(true); try { await fn(); if (ok) toast(ok); router.refresh(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };

  const saveRsvp = (decline) => run(async () => {
    const res = await admin('inv.rsvp', { id: r.id, decline, members: members.map(({ id, name, relation, age_group, meal, meal_note, attending }) => ({ id, name, relation, age_group, meal, meal_note, attending })), guestroom: gr });
    setDirty(false);
    toast(res?.waQueued ? 'RSVP saved. The guest will get a WhatsApp confirmation in about 2 minutes.' : 'RSVP saved');
  });

  const mark = (mid, fid, status) => run(() => admin('checkin.mark', { member_id: mid, function_id: fid, status }));

  return (
    <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))' }}>
      <div className="stack">
        <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="go" style={{ fontSize: 24 }}>Contact &amp; invite</h2>
            <span className={`chip ${r.rsvp === 'attending' ? 'att' : r.rsvp === 'declined' ? 'dec' : 'pen'}`}>{r.rsvp === 'attending' ? 'Attending' : r.rsvp === 'declined' ? 'Regret' : 'No reply yet'}</span>
          </div>
          <Contact r={r} />
          {r.canSend && (
            <div className="row">
              <button type="button" className="btn pri" disabled={busy} onPointerDown={() => prepareCard(r.id)} onClick={() => shareCard(r.id).then((ok) => ok && router.refresh())}><Icon n="wa" />{r.sent ? 'Resend card + message' : 'Send card + message'}</button>
              {r.mobile && <button type="button" className="btn" onClick={() => sendWhatsApp(r.id, 'invite', { withImage: false }).then((ok) => ok && router.refresh())}><Icon n="send" />Message only</button>}
              <button type="button" className="btn" onClick={() => sendWhatsApp(r.id, 'reminder', { withImage: false }).then((ok) => ok && router.refresh())}><Icon n="bell" />Send reminder</button>
            </div>
          )}
          {r.pin && (
            <div className="row" style={{ background: 'var(--well)', borderRadius: 8, padding: '8px 10px' }}>
              <span>PIN: <b className="num" style={{ letterSpacing: '.15em' }}>{showPin ? r.pin : '••••'}</b></span>
              <button type="button" className="btn sm ghost" onClick={() => setShowPin(!showPin)}>{showPin ? 'Hide' : 'Show'}</button>
              {r.canPin && <button type="button" className="btn sm" onClick={() => setPin(true)}><Icon n="key" size={15} />Reset PIN</button>}
              {r.link && <button type="button" className="btn sm" onClick={() => navigator.clipboard?.writeText(location.origin + r.link.replace(/^https?:\/\/[^/]+/, '')).then(() => toast('Link copied'), () => {})}>Copy link</button>}
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            <div className="lbl">Looked after by</div>
            <div className="row">
              <b>{r.handler || 'Unassigned'}</b>
              {r.handlerPhone && <a className="btn sm" href={`tel:+${r.handlerPhone}`} aria-label="Call handler"><Icon n="phone" size={15} /></a>}
            </div>
            {r.canTransfer && (
              <div className="row">
                <select className="inp" id="handler-to" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: '1 1 200px', width: 'auto' }}>
                  <option value="">{assignAll ? 'Assign to…' : 'Transfer to…'}</option>
                  {assignAll && <option value="none">Unassigned</option>}
                  {handlers.filter((h) => h.id !== r.handler_id && (assignAll || h.id !== me)).map((h) => <option key={h.id} value={h.id}>{h.name} · {h.role}</option>)}
                </select>
                <button type="button" className="btn grn" disabled={!to || busy} onClick={() => run(() => admin('inv.assign', { ids: [r.id], to: to === 'none' ? null : to }), 'Updated')}><Icon n="swap" />{assignAll ? 'Assign' : 'Transfer'}</button>
              </div>
            )}
          </div>
        </section>

        {event.guestroom && (<>
        <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
          <h2 className="go" style={{ fontSize: 24 }}>Guest room</h2>
          {r.canEdit && (
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={r.eligible} onChange={(e) => run(() => admin('inv.settings', { id: r.id, guestroom_eligible: e.target.checked }), 'Saved')} />
              Offer the guest room option to this guest
            </label>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Guest room required</span>
            <button type="button" className="tog" aria-pressed={gr.required} disabled={!r.canEdit} onClick={() => setGr({ ...gr, required: !gr.required })} aria-label="Guest room required"><i /></button>
          </div>
          {gr.required && (
            <div className="grid2">
              <label className="field"><span>Rooms</span><input className="inp" id="gr-rooms" type="number" min="1" max="10" value={gr.rooms} disabled={!r.canEdit} onChange={(e) => setGr({ ...gr, rooms: e.target.value })} /></label>
              <DateTimeField id="gr-eta" label="Arrival (ETA)" value={gr.eta} disabled={!r.canEdit} onChange={(v) => setGr({ ...gr, eta: v })} />
              <DateTimeField id="gr-etd" label="Departure (ETD)" value={gr.etd} disabled={!r.canEdit} onChange={(v) => setGr({ ...gr, etd: v })} />
            </div>
          )}
          {r.canEdit && <button type="button" className="btn grn" disabled={busy} onClick={() => run(() => admin('inv.guestroom', { id: r.id, ...gr }), 'Guest room saved')}>Save guest room</button>}
          {(r.need > 0 || r.rooms.length > 0) && <Allot r={r} vacant={vacant} canAllot={canAllot} onDone={() => router.refresh()} />}
        </section>
        </>)}
      </div>

      <div className="stack">
        <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="go" style={{ fontSize: 24 }}>Family &amp; RSVP</h2>
            <span className="mu" style={{ fontSize: 13 }}>Ticks = attending · P/A = attendance on the day</span>
          </div>
          {members.map((m, i) => (
            <div key={m.id || `n${i}`} style={{ borderBottom: '1px dashed var(--rule2)', paddingBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,140px),1fr))' }}>
                <label className="field" style={{ gridColumn: 'span 2' }}><span>Name{m.is_walkin ? ' · walk-in' : ''}</span>
                  <input className="inp" id={`m-name-${i}`} value={m.name} disabled={!r.canEdit} onChange={(e) => upd(i, { name: e.target.value })} /></label>
                <label className="field"><span>Relation</span>
                  <select className="inp" id={`m-rel-${i}`} value={m.relation} disabled={!r.canEdit || m.relation === 'self'} onChange={(e) => upd(i, { relation: e.target.value })}>
                    {RELATIONS.filter((x) => x !== 'self' || m.relation === 'self').map((x) => <option key={x} value={x}>{RELATION_LABEL[x]}</option>)}
                  </select></label>
                <label className="field"><span>Age</span>
                  <select className="inp" id={`m-age-${i}`} value={m.age_group} disabled={!r.canEdit} onChange={(e) => upd(i, { age_group: e.target.value })}>
                    {AGE_GROUPS.map((x) => <option key={x} value={x}>{AGE_LABEL[x]}</option>)}
                  </select></label>
                <label className="field"><span>Meal</span>
                  <select className="inp" id={`m-meal-${i}`} value={m.meal} disabled={!r.canEdit} onChange={(e) => upd(i, { meal: e.target.value })}>
                    <option value="veg">Veg</option><option value="nonveg">Non-veg</option>
                  </select></label>
                {event.dietNotes && <label className="field"><span>Dietary note</span>
                  <input className="inp" id={`m-note-${i}`} value={m.meal_note} disabled={!r.canEdit} onChange={(e) => upd(i, { meal_note: e.target.value })} /></label>}
              </div>
              <div className="row" style={{ gap: 12 }}>
                {event.functions.map((f) => (
                  <div key={f.id} className="row" style={{ gap: 6, background: 'var(--well)', borderRadius: 8, padding: '4px 8px' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{f.name}</span>
                    <button type="button" className="key" aria-pressed={m.attending.includes(f.id)} aria-label={`${m.name || 'Person'} attending ${f.name}`} disabled={!r.canEdit} onClick={() => toggleFn(i, f.id)}><Icon n="check" size={18} sw={3} /></button>
                    {m.id && r.canMark && (<>
                      <button type="button" className="key" style={{ width: 34, color: m.attendance[f.id] === 'present' ? '#fff' : 'var(--accent)', fontWeight: 800 }} aria-pressed={m.attendance[f.id] === 'present'} aria-label="Present" onClick={() => mark(m.id, f.id, m.attendance[f.id] === 'present' ? null : 'present')}>P</button>
                      <button type="button" className="key abs" style={{ width: 34, color: m.attendance[f.id] === 'absent' ? '#fff' : 'var(--red-text)', borderColor: 'var(--red)', fontWeight: 800 }} aria-pressed={m.attendance[f.id] === 'absent'} aria-label="Absent" onClick={() => mark(m.id, f.id, m.attendance[f.id] === 'absent' ? null : 'absent')}>A</button>
                    </>)}
                  </div>
                ))}
                {r.canEdit && m.relation !== 'self' && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} onClick={() => { setMembers(members.filter((_, j) => j !== i)); setDirty(true); }}>Remove</button>}
                {m.is_walkin && m.walkin_review === 'pending' && canReview && (<>
                  <button type="button" className="btn sm grn" onClick={() => run(() => admin('walkin.review', { member_id: m.id, decision: 'approved' }), 'Approved')}>Approve walk-in</button>
                  <button type="button" className="btn sm" onClick={() => run(() => admin('walkin.review', { member_id: m.id, decision: 'rejected' }), 'Marked as rejected')}>Reject</button>
                </>)}
              </div>
            </div>
          ))}
          {r.canEdit && (
            <div className="row">
              <button type="button" className="btn" onClick={add}><Icon n="plus" />Add person</button>
              <button type="button" className="btn pri" disabled={busy} onClick={() => saveRsvp(false)}>{dirty ? 'Save RSVP' : 'Save'}</button>
              <button type="button" className="btn ghost" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => saveRsvp(true)}>Mark as Regret</button>
            </div>
          )}
        </section>

        <section className="card3 band stack" style={{ padding: '20px 16px 16px' }}>
          <h2 className="go" style={{ fontSize: 24 }}>History</h2>
          {history.length === 0 && <p className="mu" style={{ margin: 0 }}>No changes recorded yet.</p>}
          <div className="stack" style={{ gap: 6, maxHeight: 340, overflow: 'auto' }}>
            {history.map((h) => (
              <div key={h.id} style={{ fontSize: 13.5, borderBottom: '1px dashed var(--rule)', paddingBottom: 5 }}>
                <b className="num">{h.at}</b> · {h.actor}<br /><span className="mu">{h.action}{h.details ? ` — ${h.details}` : ''}</span>
              </div>
            ))}
          </div>
          {r.canRemove && (
            <button type="button" className="btn ghost" style={{ color: 'var(--red-text)', alignSelf: 'flex-start' }} onClick={() => {
              if (window.confirm(`Remove ${r.name} from this event? Their RSVP and family list will be deleted.`)) run(async () => { await admin('inv.remove', { id: r.id }); router.push(`/admin/e/${event.id}/guests`); }, 'Removed');
            }}>Remove from this event</button>
          )}
        </section>
      </div>
      {pin && <PinReset r={r} onClose={() => { setPin(false); router.refresh(); }} />}
    </div>
  );
}
