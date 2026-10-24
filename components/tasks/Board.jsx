'use client';
// The task board for one event: To do · In progress · Done (tabs on a phone).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import { toast } from '@/components/client';
import TaskDialog from './TaskDialog';
import TaskForm from './TaskForm';
import { Modal, Avatar, Label, Due, STATUS, LABEL_COLORS, tasksApi } from './shared';

function Card({ c, users, labels, canDrag, dragging, onOpen, onJoin, onDragStart, onDragEnd }) {
  const done = c.status === 'done';
  return (
    <div role="button" tabIndex={0} className={`tk-card${c.priority === 'high' && !done ? ' hi' : ''}${done ? ' dn' : ''}${dragging ? ' drag' : ''}`}
      draggable={canDrag} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      {(c.labels.length > 0 || c.priority !== 'normal') && (
        <div className="row" style={{ gap: 5 }}>
          {c.labels.map((l) => <Label key={l} l={labels.get(l)} />)}
          {c.priority === 'high' && !done && <span className="tk-pri">High</span>}
          {c.priority === 'low' && <span className="tk-pri lo">Low</span>}
        </div>
      )}
      <b style={{ fontSize: 15.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{done && <span style={{ color: '#2fd486' }}>✓ </span>}{c.title}</b>
      {c.due && !done && <Due iso={c.due} />}
      {done && c.doneAt && <span className="mu" style={{ fontSize: 12.5 }}>Done {new Date(c.doneAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}{users.get(c.doneBy) ? ` by ${users.get(c.doneBy).name}` : ''}</span>}
      <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="row mu" style={{ gap: 10, fontSize: 13 }}>
          {c.items[1] > 0 && <span className="tk-meta" title="Checklist"><Icon n="check" size={14} />{c.items[0]}/{c.items[1]}</span>}
          {c.comments > 0 && <span className="tk-meta" title="Comments"><Icon n="chat" size={14} />{c.comments}</span>}
          {c.files > 0 && <span className="tk-meta" title="Files"><Icon n="clip" size={14} />{c.files}</span>}
        </span>
        {c.people.length ? (
          <span style={{ display: 'flex' }}>{c.people.slice(0, 4).map((p, i) => <span key={p} style={{ marginLeft: i ? -8 : 0 }}><Avatar user={users.get(p)} /></span>)}{c.people.length > 4 && <span className="mu" style={{ fontSize: 12, marginLeft: 4, alignSelf: 'center' }}>+{c.people.length - 4}</span>}</span>
        ) : !done && (
          <button type="button" className="btn sm grn" style={{ minHeight: 30, padding: '2px 10px' }} onClick={(e) => { e.stopPropagation(); onJoin(); }}><Icon n="plus" size={14} />Join</button>
        )}
      </div>
    </div>
  );
}

function LabelsDialog({ eventId, labels, onClose, onSaved }) {
  const [list, setList] = useState(labels.map((l) => ({ ...l })));
  const [busy, setBusy] = useState(false);
  const upd = (i, p) => setList(list.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <Modal onClose={onClose} width={560} label="Labels">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 className="go" style={{ fontSize: 26 }}>Labels</h2><button type="button" className="btn sm ghost" onClick={onClose}>✕</button></div>
      <p className="mu" style={{ margin: 0, fontSize: 14 }}>Labels group tasks on this event’s board, e.g. Catering or Transport. Deleting a label removes it from its tasks.</p>
      {list.map((l, i) => (
        <div key={l.id || `n${i}`} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <input className="inp" value={l.name} maxLength={40} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Label name" />
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {LABEL_COLORS.map((c) => <button type="button" key={c} aria-label={`Colour ${c}`} aria-pressed={l.color === c} onClick={() => upd(i, { color: c })} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: l.color === c ? '3px solid #fff' : '2px solid rgba(0,0,0,.4)', cursor: 'pointer', flex: 'none' }} />)}
          </div>
          <button type="button" className="btn sm ghost" aria-label="Delete label" onClick={() => setList(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setList([...list, { name: '', color: LABEL_COLORS[list.length % LABEL_COLORS.length] }])}><Icon n="plus" size={15} />New label</button>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await tasksApi('labels', { eventId, labels: list }); toast('Labels saved'); onSaved(); } catch (e) { toast(e.message, true); setBusy(false); }
        }}><Icon n="check" />Save labels</button>
      </div>
    </Modal>
  );
}

function CopyDialog({ eventId, onClose, onDone }) {
  const [src, setSrc] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { tasksApi('sources', { eventId }).then((r) => { setSrc(r.events); if (r.events[0]) setPick(String(r.events[0].id)); }).catch((e) => toast(e.message, true)); }, [eventId]);
  return (
    <Modal onClose={onClose} width={520} label="Copy tasks">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 className="go" style={{ fontSize: 26 }}>Copy from an earlier event</h2><button type="button" className="btn sm ghost" onClick={onClose}>✕</button></div>
      <p className="mu" style={{ margin: 0, fontSize: 14 }}>Copies each task’s title, details, priority, labels and checklist into this board as <b>To do</b>. People are not copied. Due dates move by the gap between the two events’ first functions. Tasks with a title already on this board are skipped.</p>
      {!src ? <p className="mu">Loading…</p> : !src.length ? <div className="err">No other event has tasks yet.</div> : (
        <label className="field"><span>Copy from</span><select className="inp" value={pick} onChange={(e) => setPick(e.target.value)}>{src.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.n} task{e.n > 1 ? 's' : ''}</option>)}</select></label>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" disabled={busy || !pick} onClick={async () => {
          setBusy(true);
          try {
            const r = await tasksApi('copy', { eventId, fromEventId: Number(pick) });
            toast(`${r.copied} task${r.copied === 1 ? '' : 's'} copied${r.skipped ? `, ${r.skipped} already here` : ''}${r.copied && !r.shifted ? '. Due dates were left empty (an event has no date).' : ''}`);
            onDone();
          } catch (e) { toast(e.message, true); setBusy(false); }
        }}><Icon n="swap" />Copy tasks</button>
      </div>
    </Modal>
  );
}

export default function Board({ eventId, evName }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [d, setD] = useState(null);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [lab, setLab] = useState('');
  const [who, setWho] = useState('');
  const [tab, setTab] = useState('todo');
  const [dialog, setDialog] = useState(null); // { kind: 'new', status } | { kind: 'labels' } | { kind: 'copy' }
  const [drag, setDrag] = useState(null); // { id, from }
  const [over, setOver] = useState(null); // { col, index }
  const openId = Number(sp.get('t')) || null;

  const load = useCallback(async () => {
    try { setD(await tasksApi('board', { eventId, all })); } catch (e) { toast(e.message, true); }
  }, [eventId, all]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden && !openId && !dialog && !drag) load(); }, 30000);
    return () => clearInterval(t);
  }, [load, openId, dialog, drag]);

  const open = (id) => router.push(`${path}?t=${id}`, { scroll: false });
  const close = () => router.replace(path, { scroll: false });

  const users = useMemo(() => new Map((d?.users || []).map((u) => [u.id, u])), [d]);
  const labels = useMemo(() => new Map((d?.labels || []).map((l) => [l.id, l])), [d]);
  const now = Date.now();
  const cards = useMemo(() => (d?.cards || []).filter((c) => {
    if (q && !c.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (mine && !c.people.includes(d.me)) return false;
    if (overdue && !(c.status !== 'done' && c.due && new Date(c.due).getTime() < now)) return false;
    if (lab && !c.labels.includes(Number(lab))) return false;
    if (who && !c.people.includes(Number(who))) return false;
    return true;
  }), [d, q, mine, overdue, lab, who, now]);
  const cols = Object.keys(STATUS).map((s) => ({ id: s, name: STATUS[s], cards: cards.filter((c) => c.status === s) }));
  const counts = { mine: (d?.cards || []).filter((c) => c.people.includes(d.me) && c.status !== 'done').length, over: (d?.cards || []).filter((c) => c.status !== 'done' && c.due && new Date(c.due).getTime() < now).length };
  const canWork = (c) => d?.manage || c.people.includes(d?.me);

  async function join(c) {
    try { await tasksApi('join', { id: c.id }); toast('You joined this task'); load(); } catch (e) { toast(e.message, true); }
  }

  function dragOver(e, col) {
    if (!drag) return;
    e.preventDefault();
    const els = [...e.currentTarget.querySelectorAll('[data-card]')].filter((el) => Number(el.dataset.card) !== drag.id);
    let index = els.length;
    for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { index = i; break; } }
    if (over?.col !== col || over?.index !== index) setOver({ col, index });
  }
  async function drop(col) {
    if (!drag || !over) { setDrag(null); setOver(null); return; }
    const moving = d.cards.find((c) => c.id === drag.id);
    // the visible column may be filtered: insert next to the card shown at that index
    const visible = cols.find((c) => c.id === col).cards.filter((c) => c.id !== drag.id);
    const before = visible[over.index];
    const all2 = d.cards.filter((c) => c.status === col && c.id !== drag.id);
    const pos = before ? all2.findIndex((c) => c.id === before.id) : all2.length;
    const order = [...all2.slice(0, pos).map((c) => c.id), drag.id, ...all2.slice(pos).map((c) => c.id)];
    // optimistic
    setD({ ...d, cards: [...d.cards.filter((c) => c.id !== drag.id && c.status !== col), ...order.map((id) => (id === drag.id ? { ...moving, status: col } : d.cards.find((c) => c.id === id)))] });
    setDrag(null); setOver(null);
    try {
      await tasksApi('move', { id: moving.id, status: col, order });
      if (col !== moving.status) toast(col === 'done' ? 'Marked as done' : `Moved to ${STATUS[col]}`);
    } catch (e) { toast(e.message, true); }
    load();
  }

  return (
    <>
      <div className="top">
        <div style={{ flex: 1, minWidth: 200 }}><div className="lbl">{evName}</div><h1>Tasks</h1></div>
        {d?.manage && <button type="button" className="btn" onClick={() => setDialog({ kind: 'labels' })}><Icon n="edit" />Labels</button>}
        {d?.manage && <button type="button" className="btn" onClick={() => setDialog({ kind: 'copy' })}><Icon n="swap" />Copy from earlier event</button>}
        {d?.manage && <button type="button" className="btn pri" onClick={() => setDialog({ kind: 'new', status: 'todo' })}><Icon n="plus" />New task</button>}
      </div>
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <input className="inp" type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} aria-label="Search tasks" />
        <button type="button" className={`fchip${!mine && !overdue && !lab && !who && !q ? ' on' : ''}`} onClick={() => { setMine(false); setOverdue(false); setLab(''); setWho(''); setQ(''); }}>All</button>
        <button type="button" className={`fchip${mine ? ' on' : ''}`} onClick={() => setMine(!mine)}>Mine · {counts.mine}</button>
        <button type="button" className={`fchip red${overdue ? ' on' : ''}`} onClick={() => setOverdue(!overdue)}>Overdue · {counts.over}</button>
        <select className="fchip" value={lab} onChange={(e) => setLab(e.target.value)} aria-label="Filter by label">
          <option value="">Label ▾</option>{(d?.labels || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="fchip" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="">Person ▾</option>{(d?.users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="mu" style={{ fontSize: 13, marginLeft: 'auto' }}>{all ? 'Showing all done tasks' : 'Done tasks older than 7 days are hidden'} · <button type="button" className="btn sm ghost" style={{ minHeight: 0, padding: 0, display: 'inline', textDecoration: 'underline' }} onClick={() => setAll(!all)}>{all ? 'Hide old' : 'Show all'}</button></span>
      </div>
      <div className="tk-tabs" role="tablist">
        {cols.map((c) => <button type="button" role="tab" aria-selected={tab === c.id} key={c.id} className={`fchip${tab === c.id ? ' on' : ''}`} onClick={() => setTab(c.id)} aria-label={`${c.name}: ${c.cards.length}`}><b>{c.name}</b><small className="num">{c.cards.length}</small></button>)}
      </div>
      {!d ? <div className="tk-board">{[0, 1, 2].map((i) => <div key={i} className="tk-col skel" style={{ height: 220 }} />)}</div> : (
        <div className="tk-board">
          {cols.map((col) => (
            <section key={col.id} className={`tk-col${tab !== col.id ? ' m-hide' : ''}${over?.col === col.id ? ' over' : ''}`} aria-label={col.name}
              onDragOver={(e) => dragOver(e, col.id)} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }} onDrop={(e) => { e.preventDefault(); drop(col.id); }}>
              <header className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="go" style={{ fontSize: 21 }}>{col.name} <span className="mu num" style={{ fontFamily: 'var(--body)', fontSize: 14 }}>{col.cards.length}</span></h2>
                {d.manage && col.id !== 'done' && <button type="button" className="btn sm ghost" onClick={() => setDialog({ kind: 'new', status: col.id })}><Icon n="plus" size={15} />Add</button>}
              </header>
              {(() => { let vi = -1; return col.cards.map((c) => {
                if (c.id !== drag?.id) vi++;
                const line = over?.col === col.id && c.id !== drag?.id && over.index === vi;
                return (
                  <div key={c.id} data-card={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {line && <div className="tk-drop" />}
                    <Card c={c} users={users} labels={labels} me={d.me} canDrag={canWork(c)} dragging={drag?.id === c.id}
                      onOpen={() => open(c.id)} onJoin={() => join(c)}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(c.id)); } catch {} setDrag({ id: c.id, from: col.id }); }}
                      onDragEnd={() => { setDrag(null); setOver(null); }} />
                  </div>
                ); }); })()}
              {over?.col === col.id && over.index >= col.cards.filter((x) => x.id !== drag?.id).length && <div className="tk-drop" />}
              {!col.cards.length && !over && <p className="mu" style={{ margin: 0, fontSize: 13.5, textAlign: 'center', padding: '14px 0' }}>{col.id === 'todo' ? (d.manage ? 'No tasks. Tap “New task” to add one.' : 'Nothing to do here yet.') : col.id === 'doing' ? 'Nothing in progress.' : 'Nothing finished yet.'}</p>}
            </section>
          ))}
        </div>
      )}
      <p className="mu" style={{ fontSize: 13, marginTop: 12 }}>Drag a card to another column to move it. On a phone, open the task and tap its status.</p>

      {openId && d && <TaskDialog key={openId} id={openId} labels={d.labels} users={d.users} me={d.me} manage={d.manage} onClose={close} onChanged={load} />}
      {dialog?.kind === 'new' && d && <TaskForm eventId={eventId} status={dialog.status} labels={d.labels} users={d.users} onClose={() => setDialog(null)} onDone={(t) => { setDialog(null); load(); open(t.id); }} />}
      {dialog?.kind === 'labels' && d && <LabelsDialog eventId={eventId} labels={d.labels} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}
      {dialog?.kind === 'copy' && <CopyDialog eventId={eventId} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />}
    </>
  );
}
