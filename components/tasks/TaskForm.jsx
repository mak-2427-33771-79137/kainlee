'use client';
// New task / Edit task form (task managers).
import { useState } from 'react';
import Icon from '@/components/Icon';
import { toast } from '@/components/client';
import { Modal, Avatar, PRIORITY, STATUS, toInputs, fromInputs, tasksApi } from './shared';

export default function TaskForm({ eventId, task, status = 'todo', labels, users, onDone, onClose }) {
  const editing = !!task;
  const d0 = toInputs(task?.due);
  const [f, setF] = useState({
    title: task?.title || '', details: task?.details || '', priority: task?.priority || 'normal',
    date: d0.date, time: d0.time, labels: task?.labels || [], people: task?.people || [], status: task?.status || status,
  });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const toggle = (key, id) => set({ [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] });
  const userById = new Map(users.map((u) => [u.id, u]));

  async function save(e) {
    e.preventDefault();
    if (f.title.trim().length < 2) { toast('Give the task a title.', true); return; }
    setBusy(true);
    try {
      const data = { title: f.title, details: f.details, priority: f.priority, due: fromInputs(f.date, f.time), labels: f.labels, people: f.people };
      const r = editing ? await tasksApi('update', { id: task.id, ...data }) : await tasksApi('create', { eventId, status: f.status, ...data });
      toast(editing ? 'Task saved' : 'Task added');
      onDone(r.task);
    } catch (er) { toast(er.message, true); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} width={640} label={editing ? 'Edit task' : 'New task'}>
      <form className="stack" onSubmit={save}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="go" style={{ fontSize: 26 }}>{editing ? 'Edit task' : `New task${status !== 'todo' ? ` · ${STATUS[status]}` : ''}`}</h2>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <label className="field"><span>Title</span><input className="inp" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} autoFocus={!editing} placeholder="e.g. Book shamiana and 200 chairs" /></label>
        <label className="field"><span>Details</span><textarea className="inp" value={f.details} onChange={(e) => set({ details: e.target.value })} maxLength={5000} placeholder="What exactly needs doing (optional)" /></label>
        <div className="grid2">
          <fieldset className="dtf"><legend>Due</legend><div className="dtf-row">
            <label className="dtf-cell"><span>Date</span><input className="inp" type="date" value={f.date} onChange={(e) => set({ date: e.target.value, time: f.time || (e.target.value ? '17:00' : '') })} /><i>{f.date ? '' : 'dd/mm/yyyy'}</i></label>
            <label className="dtf-cell"><span>Time</span><input className="inp" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} disabled={!f.date} /><i>{f.time ? '' : '--:--'}</i></label>
          </div>{f.date && <button type="button" className="btn sm ghost" style={{ paddingLeft: 0 }} onClick={() => set({ date: '', time: '' })}>Remove due date</button>}</fieldset>
          <label className="field"><span>Priority</span><select className="inp" value={f.priority} onChange={(e) => set({ priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="lbl">Labels</div>
          <div className="row" style={{ gap: 6 }}>
            {labels.map((l) => {
              const on = f.labels.includes(l.id);
              return <button type="button" key={l.id} className="tk-lab" aria-pressed={on} onClick={() => toggle('labels', l.id)} style={{ '--c': l.color, opacity: on ? 1 : 0.45, fontSize: 13, padding: '5px 11px' }}>{on ? '✓ ' : ''}{l.name}</button>;
            })}
            {!labels.length && <span className="mu" style={{ fontSize: 13 }}>No labels yet. Add them with the Labels button on the board.</span>}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="lbl">People</div>
          <div className="row" style={{ gap: 6 }}>
            {f.people.map((id) => (
              <button type="button" key={id} className="chip att" style={{ gap: 6, padding: '3px 8px 3px 3px', border: 0, cursor: 'pointer' }} onClick={() => toggle('people', id)} aria-label={`Remove ${userById.get(id)?.name || ''}`}>
                <Avatar user={userById.get(id)} size={22} />{userById.get(id)?.name || 'Former user'} ✕
              </button>
            ))}
            <select className="inp" style={{ maxWidth: 240 }} value="" onChange={(e) => e.target.value && toggle('people', Number(e.target.value))} aria-label="Add person">
              <option value="">+ Add person…</option>
              {users.filter((u) => !f.people.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <span className="mu" style={{ fontSize: 12.5 }}>{editing ? 'People added or removed are notified. Changing the due date notifies everyone on the task.' : 'Everyone you add is notified.'}</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy}><Icon n="check" />{editing ? 'Save changes' : 'Add task'}</button>
        </div>
      </form>
    </Modal>
  );
}
