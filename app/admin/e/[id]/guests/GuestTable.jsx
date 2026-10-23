'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import Portal from '@/components/Portal';
import ExportMenu from '@/components/ExportMenu';
import useMedia from '@/components/useMedia';
import { admin, toast } from '@/components/client';
import { sendWhatsApp, shareCard, prepareCard, forgetCard } from '@/components/sendInvite';
import { CATEGORIES } from '@/lib/consts';

const RSVP = { attending: ['att', 'Attending'], declined: ['dec', 'Regret'], pending: ['pen', 'Pending'] };

export default function GuestTable({ event, rows, filters, counts, handlers, vacant, roomStats, me, perms }) {
  const router = useRouter();
  const path = usePathname();
  const phone = useMedia('(max-width: 760px)');
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState(filters.q || '');
  const [limit, setLimit] = useState(120);
  const [pinFor, setPinFor] = useState(null);
  const [assignTo, setAssignTo] = useState('');
  const [moreF, setMoreF] = useState(false);
  const [selMode, setSelMode] = useState(false);
  const gr = event.guestroom;
  const showRooms = gr && (filters.offrs === '1' || !!filters.guestroom);
  const picking = !phone || selMode || sel.size > 0;

  const setF = (patch) => {
    const next = { ...filters, ...patch };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    router.push(`${path}?${new URLSearchParams(next)}`);
    setSel(new Set());
  };
  useEffect(() => {
    if ((filters.q || '') === q) return;
    const t = setTimeout(() => setF({ q }), 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.slice(0, limit);
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const selectable = rows.filter((r) => r.canTransfer);
  const allSel = selectable.length > 0 && selectable.every((r) => sel.has(r.id));

  async function assign() {
    if (!sel.size) return;
    try {
      const r = await admin('inv.assign', { ids: [...sel], to: assignTo === 'none' ? null : assignTo });
      toast(`${r.count} guest(s) ${assignTo === 'none' ? 'unassigned' : 'assigned'}`);
      setSel(new Set()); setSelMode(false); setAssignTo(''); router.refresh();
    } catch (e) { toast(e.message, true); }
  }

  const chip = (label, patch, on, red) => (
    <button type="button" className={`fchip${on ? ' on' : ''}${red ? ' red' : ''}`} onClick={() => setF(patch)}>{label}</button>
  );
  const noF = { status: '', category: '', offrs: '', guestroom: '', handler: '', walkin: '', fn: '', att: '' };

  return (
    <>
      <div className="top">
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="lbl">{event.name}</div>
          <h1>{filters.handler === 'me' ? 'My guests' : filters.offrs === '1' ? 'Officers' : 'Guests'}</h1>
          <div className="mu" style={{ fontSize: 14 }}>{rows.length} shown{showRooms ? ` · Rooms: ${roomStats.rooms_needed} required, ${roomStats.rooms_allotted} allotted, ${roomStats.vacant} vacant, ${roomStats.still_needed} still needed` : ''}</div>
        </div>
        {(perms.exportAll || perms.exportOwn) && (
          <ExportMenu eventId={event.id} filters={perms.exportAll ? filters : { ...filters, handler: 'me' }} label={perms.exportAll ? 'Export this list' : 'Export my guests'}
            reports={[['guests', 'Guest list'], ['attendance', 'Attendance'], ['rooms', 'Guest rooms']]} />
        )}
      </div>

      <div className="card3 band" style={{ padding: '16px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row">
          <label className="field" style={{ flex: '1 1 240px' }}><span>Search</span>
            <input className="inp" id="g-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, rank, mobile, room, city…" />
          </label>
          {(!phone || moreF) && (<>
          <label className="field" style={{ flex: '1 1 180px' }}><span>Looked after by</span>
            <select className="inp" id="g-handler" value={filters.handler || ''} onChange={(e) => setF({ handler: e.target.value })}>
              <option value="">Everyone</option>
              {perms.isHandler && <option value="me">Me ({counts.mine})</option>}
              <option value="none">Unassigned ({counts.unassigned})</option>
              {handlers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 160px' }}><span>Category</span>
            <select className="inp" id="g-cat" value={filters.category || ''} onChange={(e) => setF({ category: e.target.value, offrs: '' })}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}
            </select>
          </label>
          </>)}
          {phone && <button type="button" className="btn sm ghost" onClick={() => setMoreF(!moreF)} aria-expanded={moreF}>{moreF ? 'Fewer filters' : `More filters${filters.handler || filters.category ? ' •' : ''}`}</button>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {chip(`All ${counts.all}`, noF, !Object.keys(filters).some((k) => k !== 'q'))}
          {chip(`✓ Attending ${counts.attending}`, { status: filters.status === 'attending' ? '' : 'attending' }, filters.status === 'attending')}
          {chip(`✕ Regret ${counts.declined}`, { status: filters.status === 'declined' ? '' : 'declined' }, filters.status === 'declined', true)}
          {chip(`No reply ${counts.pending}`, { status: filters.status === 'pending' ? '' : 'pending' }, filters.status === 'pending')}
          {chip(`Not sent ${counts.unsent}`, { status: filters.status === 'unsent' ? '' : 'unsent' }, filters.status === 'unsent')}
          {chip(`Offrs ${counts.offrs}`, { offrs: filters.offrs === '1' ? '' : '1', category: '' }, filters.offrs === '1')}
          {gr && chip(`Guest room ${counts.gr}`, { guestroom: filters.guestroom === 'required' ? '' : 'required' }, filters.guestroom === 'required')}
          {gr && chip(`Allotment pending ${counts.grPending}`, { guestroom: filters.guestroom === 'pending' ? '' : 'pending' }, filters.guestroom === 'pending', true)}
        </div>
        {selectable.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            {phone && !selMode && sel.size === 0 && <button type="button" className="btn sm" id="g-selmode" onClick={() => setSelMode(true)}><Icon n="swap" size={15} />Select guests to assign</button>}
            {picking && <button type="button" className="btn sm" id="g-selall" onClick={() => setSel(allSel ? new Set() : new Set(selectable.map((r) => r.id)))}>{allSel ? 'Unselect all' : `Select all ${selectable.length} shown`}</button>}
            {picking && phone && <span className="mu" style={{ fontSize: 13 }}>Tick guests, then pick who looks after them.</span>}
          </div>
        )}
      </div>

      {rows.length === 0 && <div className="card3 band" style={{ padding: 20 }}><b>No guests match.</b> <span className="mu">Clear a filter or add invitees from the directory.</span></div>}

      {!phone && rows.length > 0 && (
        <div className="card3" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ maxHeight: '70vh' }}>
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 34 }}>{selectable.length > 0 && <input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(selectable.map((r) => r.id)))} />}</th>
                <th style={{ minWidth: 190 }}>Invitee</th><th>Contact</th><th>Looked after by</th><th>RSVP</th><th>Heads</th>
                {gr && <th>Guest room</th>}{showRooms && <><th>ETA</th><th>ETD</th><th style={{ minWidth: 260 }}>Allotment / comment</th></>}
                <th>Invite</th>
              </tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>{r.canTransfer && <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                    <td><Link href={`/admin/e/${event.id}/guests/${r.id}`} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'none' }}>{r.name}</Link>
                      <div className="sub">{r.cat}{r.family ? ` · ${r.family}` : ''}{r.city ? ` · ${r.city}` : ''}{r.walkinPending ? ' · walk-in to review' : ''}</div></td>
                    <td><Contact r={r} /></td>
                    <td>{r.handler || <span className="chip pen">Unassigned</span>}</td>
                    <td><span className={`chip ${RSVP[r.rsvp][0]}`}>{RSVP[r.rsvp][1]}</span></td>
                    <td className="num"><b>{r.rsvp === 'pending' ? '—' : r.heads}</b></td>
                    {gr && <td>{r.need ? <span className="chip gr">{r.need > 1 ? `${r.need} rooms` : 'Required'}</span> : r.eligible ? <span className="chip gray">Not required</span> : <span className="mu">—</span>}</td>}
                    {showRooms && <>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.need && r.eta ? <><b>{r.eta[0]}</b><br />{r.eta[1]}</> : '—'}</td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{r.need && r.etd ? <><b>{r.etd[0]}</b><br />{r.etd[1]}</> : '—'}</td>
                      <td><Allot r={r} vacant={vacant} canAllot={perms.allot} onDone={() => router.refresh()} /></td>
                    </>}
                    <td><Actions r={r} onPin={() => setPinFor(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {phone && rows.length > 0 && (
        <div className="stack">
          {visible.map((r) => (
            <div key={r.id} className="card3" style={{ padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                {r.canTransfer && picking && <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ marginTop: 3, width: 24, height: 24, flex: 'none', accentColor: 'var(--accent)' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/admin/e/${event.id}/guests/${r.id}`} style={{ color: 'inherit', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>{r.name}</Link>
                  <div className="sub mu" style={{ fontSize: 13 }}>{r.cat}{r.family ? ` · ${r.family}` : ''} · {r.handler || 'Unassigned'}</div>
                </div>
                <span className={`chip ${RSVP[r.rsvp][0]}`}>{RSVP[r.rsvp][1]}{r.rsvp === 'attending' ? ` · ${r.heads}` : ''}</span>
              </div>
              {gr && r.need > 0 && (
                <div style={{ background: 'var(--well-red)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="row" style={{ gap: 6 }}><span className="chip gr">{r.need} room{r.need > 1 ? 's' : ''}</span>
                    <span className="num" style={{ fontSize: 13 }}>ETA {r.eta?.join(' ')} → ETD {r.etd?.join(' ')}</span></div>
                  <Allot r={r} vacant={vacant} canAllot={perms.allot} onDone={() => router.refresh()} />
                </div>
              )}
              <div className="row" style={{ justifyContent: 'space-between' }}><Contact r={r} /><Actions r={r} onPin={() => setPinFor(r)} /></div>
            </div>
          ))}
        </div>
      )}
      {rows.length > limit && <button type="button" className="btn" onClick={() => setLimit(limit + 200)}>Show more ({rows.length - limit} more)</button>}

      {pinFor && <PinReset r={pinFor} onClose={() => setPinFor(null)} />}

      {(sel.size > 0 || selMode) && (
        <Portal>
          <div className="actbar card3 band" role="region" aria-label="Assign selected guests">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <b>{sel.size} guest{sel.size === 1 ? '' : 's'} selected</b>
              <button type="button" className="btn sm ghost" onClick={() => { setSel(new Set()); setSelMode(false); }}>Cancel</button>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <select className="inp" id="g-assign" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={{ flex: 1, minWidth: 0 }} aria-label="Looked after by">
                <option value="">{perms.assign ? 'Looked after by…' : 'Transfer to…'}</option>
                {perms.assign && <option value="none">Nobody (unassign)</option>}
                {handlers.filter((h) => perms.assign || h.id !== me.id).map((h) => <option key={h.id} value={h.id}>{h.name} · {h.role}</option>)}
              </select>
              <button type="button" className="btn grn" id="g-assign-go" disabled={!assignTo || !sel.size} onClick={assign}><Icon n="swap" />{perms.assign ? 'Assign' : 'Transfer'}</button>
            </div>
            {perms.remove && sel.size > 0 && (
              <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)', alignSelf: 'flex-start' }}
                onClick={async () => {
                  if (!window.confirm(`Remove ${sel.size} guest(s) from ${event.name}? Their RSVP, family list, room and check-ins for this event are deleted. They stay in the invitee directory.`)) return;
                  try { const r = await admin('inv.remove', { ids: [...sel] }); toast(`${r.count} removed`); setSel(new Set()); setSelMode(false); router.refresh(); } catch (e) { toast(e.message, true); }
                }}><Icon n="x" size={15} />Remove {sel.size} from this event</button>
            )}
          </div>
        </Portal>
      )}
    </>
  );
}

export function Contact({ r }) {
  if (!r.mobile) return <span className="mu">—</span>;
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <a className="btn sm" href={`tel:+${r.mobile}`} aria-label={`Call ${r.name}`} title={`Call ${r.mobilePretty}`}><Icon n="phone" size={16} /></a>
      <a className="btn sm" href={`https://wa.me/${r.mobile}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${r.name}`} title="WhatsApp chat"><Icon n="wa" size={16} /></a>
      <span className="num sub" style={{ whiteSpace: 'nowrap' }}>{r.mobilePretty}</span>
    </span>
  );
}

function Actions({ r, onPin }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      {r.canSend && (
        <button type="button" className="btn sm pri" disabled={busy} title={`Send card image + message${r.sent ? ` · last sent ${r.sent}` : ''}`}
          onPointerDown={() => prepareCard(r.id)}
          onClick={async () => { setBusy(true); if (await shareCard(r.id)) router.refresh(); setBusy(false); }}>
          <Icon n="wa" size={15} />{r.sent ? 'Resend' : 'Send'}
        </button>
      )}
      {r.canSend && r.mobile && <button type="button" className="btn sm" title="Message only, straight to their number" aria-label="Message only to their number" onClick={async () => { setBusy(true); if (await sendWhatsApp(r.id, 'invite', { withImage: false })) router.refresh(); setBusy(false); }}><Icon n="send" size={15} /></button>}
      {r.canPin && <button type="button" className="btn sm" title="Reset PIN" aria-label="Reset PIN" onClick={onPin}><Icon n="key" size={15} /></button>}
    </span>
  );
}

export function Allot({ r, vacant, canAllot, onDone }) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(r.note);
  const [vis, setVis] = useState(r.noteVisible);
  const [busy, setBusy] = useState(false);
  if (!r.need && !r.rooms.length) return <span className="mu">—</span>;
  const short = r.need - r.rooms.length;
  const act = async (fn) => { setBusy(true); try { await fn(); onDone(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        {r.rooms.map((rm) => (
          <span key={rm.id} className="chip att" title={rm.location || ''}>{rm.name}{rm.location ? `, ${rm.location}` : ''}
            {canAllot && <button type="button" aria-label={`Free ${rm.name}`} disabled={busy} onClick={() => act(() => admin('room.unallot', { room_id: rm.id }))} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 2 }}>✕</button>}
          </span>
        ))}
        {short > 0 && <span className="chip dec">{short} to allot</span>}
        {canAllot && short > 0 && vacant.length > 0 && (
          <select className="inp" aria-label="Allot a vacant room" disabled={busy} value="" onChange={(e) => e.target.value && act(() => admin('room.allot', { room_id: e.target.value, invitation_id: r.id }))} style={{ minHeight: 32, padding: '3px 6px', width: 'auto', fontSize: 13 }}>
            <option value="">Allot room…</option>
            {vacant.map((v) => <option key={v.id} value={v.id}>{v.name}{v.location ? ` · ${v.location}` : ''}</option>)}
          </select>
        )}
        {canAllot && short > 0 && !vacant.length && <span className="mu" style={{ fontSize: 12.5 }}>No vacant rooms. Add rooms in Guest rooms.</span>}
      </div>
      {!edit ? (
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <span style={{ flex: 1, fontSize: 13.5, color: r.note ? 'inherit' : 'var(--red-text)', fontStyle: r.note ? 'normal' : 'italic' }}>{r.note || 'No comment yet'}{r.note && !r.noteVisible ? ' (internal)' : ''}</span>
          {r.canEdit && <button type="button" className="btn sm" aria-label="Edit comment" onClick={() => setEdit(true)}><Icon n="edit" size={15} /></button>}
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <textarea className="inp" id={`note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Room 4, Offrs Mess Annexe. Key with mess hav." style={{ minHeight: 60, fontSize: 14 }} />
          <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} />Show this comment to the officer</label>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn sm grn" disabled={busy} onClick={() => act(async () => { await admin('inv.note', { id: r.id, note, visible: vis }); setEdit(false); toast('Comment saved'); })}>Save</button>
            <button type="button" className="btn sm ghost" onClick={() => { setEdit(false); setNote(r.note); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PinReset({ r, onClose }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (newLink) => {
    setBusy(true);
    try { setRes(await admin('inv.resetPin', { id: r.id, newLink })); forgetCard(r.id); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Reset PIN · ${r.name}`} onClose={onClose}>
      {!res ? (<>
        <p style={{ margin: 0 }}>A new 4-digit PIN replaces the old one immediately. Choose <b>log out other phones</b> if the invitation may have been opened by someone else.</p>
        <div className="row">
          <button type="button" className="btn pri" disabled={busy} onClick={() => go(false)}><Icon n="key" />New PIN</button>
          <button type="button" className="btn" disabled={busy} onClick={() => go(true)}>New PIN + log out other phones</button>
        </div>
      </>) : (<>
        <div className="okmsg">New PIN: <span className="num" style={{ fontSize: 26, letterSpacing: '.2em' }}>{res.pin}</span></div>
        <div className="mu" style={{ wordBreak: 'break-all', fontSize: 13 }}>Link: {res.link}</div>
        <div className="row">
          {r.mobile && <a className="btn pri" href={res.wa} target="_blank" rel="noopener noreferrer"><Icon n="wa" />Send on WhatsApp</a>}
          <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(`Your new PIN: ${res.pin}\n${res.link}`).then(() => toast('Copied'), () => {}); }}>Copy</button>
        </div>
      </>)}
    </Modal>
  );
}
