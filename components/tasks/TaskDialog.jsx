'use client';
// One task, opened from the board: status, details, checklist, files, comments, history, people.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { toast, download } from '@/components/client';
import { isNative } from '@/components/native';
import TaskForm from './TaskForm';
import { Modal, Avatar, Label, Due, STATUS, PRIORITY, tasksApi, uploadFile, when, longDue, toInputs, fromInputs, mb } from './shared';

function ItemRow({ it, users, canWork, me, manage, onChange }) {
  const [edit, setEdit] = useState(false);
  const d = toInputs(it.due);
  const [f, setF] = useState({ text: it.text, user: it.user || '', date: d.date, time: d.time });
  const user = users.find((u) => u.id === it.user);
  const canTick = canWork || it.user === me;
  if (edit) {
    return (
      <form className="tk-ci" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (await onChange('item.update', { id: it.id, text: f.text, user: f.user ? Number(f.user) : null, due: fromInputs(f.date, f.time) })) setEdit(false); }}>
        <label className="field" style={{ flex: '2 1 200px' }}><span>Item</span><input className="inp" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} maxLength={300} autoFocus /></label>
        <label className="field" style={{ flex: '1 1 150px' }}><span>Person</span><select className="inp" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}><option value="">Nobody</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="field" style={{ flex: '1 1 140px' }}><span>Due date</span><input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, time: f.time || (e.target.value ? '17:00' : '') })} /></label>
        <label className="field" style={{ flex: '1 1 100px' }}><span>Time</span><input className="inp" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} disabled={!f.date} /></label>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm grn"><Icon n="check" size={15} />Save</button>
          <button type="button" className="btn sm" onClick={() => setEdit(false)}>Cancel</button>
          <button type="button" className="btn sm ghost" style={{ color: '#ffb0a4' }} onClick={() => onChange('item.delete', { id: it.id })}>Delete</button>
        </div>
      </form>
    );
  }
  return (
    <div className="tk-ci" style={{ flexWrap: 'nowrap' }}>
      <input type="checkbox" checked={it.done} disabled={!canTick} onChange={(e) => onChange('item.toggle', { id: it.id, done: e.target.checked })} style={{ width: 22, height: 22, accentColor: '#2fd486', flex: 'none' }} aria-label={`Done: ${it.text}`} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}>
        <span style={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere', textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.6 : 1 }}>{it.text}</span>
        {(it.due || user) && <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>{it.due && <Due iso={it.due} done={it.done} style={{ fontSize: 12 }} />}{user && <Avatar user={user} size={24} />}</span>}
      </div>
      {(canWork || manage) && <button type="button" className="btn sm ghost" style={{ minHeight: 28, padding: '2px 6px' }} onClick={() => setEdit(true)} aria-label="Edit item"><Icon n="edit" size={15} /></button>}
    </div>
  );
}

function AddItem({ users, onAdd }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ text: '', user: '', date: '', time: '' });
  if (!open) return <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}><Icon n="plus" size={15} />Add item</button>;
  return (
    <form className="tk-ci" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (await onAdd({ text: f.text, user: f.user ? Number(f.user) : null, due: fromInputs(f.date, f.time) })) { setF({ text: '', user: '', date: '', time: '' }); } }}>
      <label className="field" style={{ flex: '2 1 200px' }}><span>New item</span><input className="inp" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} maxLength={300} autoFocus placeholder="e.g. Pay advance" /></label>
      <label className="field" style={{ flex: '1 1 150px' }}><span>Person (optional)</span><select className="inp" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}><option value="">Nobody</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="field" style={{ flex: '1 1 140px' }}><span>Due date</span><input className="inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, time: f.time || (e.target.value ? '17:00' : '') })} /></label>
      <label className="field" style={{ flex: '1 1 100px' }}><span>Time</span><input className="inp" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} disabled={!f.date} /></label>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sm grn" disabled={!f.text.trim()}><Icon n="plus" size={15} />Add</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
      </div>
    </form>
  );
}

function DeleteConfirm({ task, onClose, onDeleted, users }) {
  const [busy, setBusy] = useState(false);
  const size = task.files.reduce((a, f) => a + f.size, 0);
  const ppl = task.people.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean);
  return (
    <Modal onClose={onClose} width={500} label="Delete task">
      <h2 className="go" style={{ fontSize: 26 }}>Delete this task?</h2>
      <p style={{ margin: 0 }}><b>{task.title}</b></p>
      <div className="err" style={{ fontWeight: 400 }}>
        This permanently deletes the task
        {task.items.length ? <> with its <b>{task.items.length} checklist item{task.items.length > 1 ? 's' : ''}</b></> : null}
        {task.comments.length ? <>, <b>{task.comments.length} comment{task.comments.length > 1 ? 's' : ''}</b></> : null}
        {task.files.length ? <> and <b>{task.files.length} attached file{task.files.length > 1 ? 's' : ''} ({mb(size)})</b>. The files are erased from the server and cannot be recovered.</> : '. It cannot be recovered.'}
      </div>
      {task.files.length > 0 && <ul className="mu" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{task.files.map((f) => <li key={f.id}>{f.name}</li>)}</ul>}
      {ppl.length > 0 && <span className="mu" style={{ fontSize: 13 }}>{ppl.join(' and ')} will be told it was deleted.</span>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const r = await tasksApi('delete', { id: task.id }); toast(r.files ? `Task deleted · ${r.files} file(s) erased` : 'Task deleted'); onDeleted(); } catch (e) { toast(e.message, true); setBusy(false); }
        }}><Icon n="x" />Delete permanently</button>
      </div>
    </Modal>
  );
}

export default function TaskDialog({ id, labels, users, me, manage, onClose, onChanged }) {
  const [t, setT] = useState(null);
  const [mode, setMode] = useState('view'); // view | edit | delete
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    tasksApi('get', { id }).then((r) => alive && setT(r.task)).catch((e) => { toast(e.message, true); onClose(); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTask = !!t?.people.includes(me);
  const canWork = manage || onTask;
  const userById = new Map(users.map((u) => [u.id, u]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  async function act(action, data, ok) {
    setBusy(true);
    try { const r = await tasksApi(action, data); if (r.task) setT(r.task); if (ok) toast(ok); onChanged?.(); return true; } catch (e) { toast(e.message, true); return false; } finally { setBusy(false); }
  }
  async function addFiles(list) {
    for (const file of list) {
      setUploading(file.name);
      try { const r = await uploadFile(t.id, file); setT(r.task); onChanged?.(); } catch (e) { toast(e.message, true); }
    }
    setUploading('');
    if (fileRef.current) fileRef.current.value = '';
  }
  const openFile = (f) => (e) => {
    if (isNative()) { e.preventDefault(); download(`/api/tasks/file/${f.id}?dl=1`); }
  };

  if (!t) return <Modal onClose={onClose} label="Task"><p className="mu" style={{ margin: 0 }}>Opening…</p></Modal>;
  if (mode === 'edit') return <TaskForm eventId={t.eventId} task={t} labels={labels} users={users} onClose={() => setMode('view')} onDone={(nt) => { setT(nt); setMode('view'); onChanged?.(); }} />;
  if (mode === 'delete') return <DeleteConfirm task={t} users={users} onClose={() => setMode('view')} onDeleted={() => { onChanged?.(); onClose(); }} />;

  const doneItems = t.items.filter((i) => i.done).length;
  const pct = t.items.length ? Math.round((doneItems / t.items.length) * 100) : 0;
  const creator = userById.get(t.createdBy);

  return (
    <Modal onClose={onClose} label={t.title}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 5 }}>
            {t.labels.map((lid) => <Label key={lid} l={labelById.get(lid)} />)}
            {t.priority !== 'normal' && <span className={`tk-pri${t.priority === 'low' ? ' lo' : ''}`}>{PRIORITY[t.priority]} priority</span>}
          </div>
          <h2 className="go" style={{ fontSize: 28, overflowWrap: 'anywhere' }}>{t.title}</h2>
        </div>
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {manage && <button type="button" className="btn sm" onClick={() => setMode('edit')}><Icon n="edit" size={15} />Edit</button>}
          {manage && <button type="button" className="btn sm" style={{ color: '#ffb0a4', borderColor: 'rgba(255,110,90,.55)' }} onClick={() => setMode('delete')}><Icon n="x" size={15} />Delete</button>}
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <button key={k} type="button" className={`fchip${t.status === k ? ' on' : ''}`} disabled={!canWork || busy} aria-pressed={t.status === k}
            onClick={() => t.status !== k && act('move', { id: t.id, status: k }, k === 'done' ? 'Marked as done' : `Moved to ${v}`)}>{v}</button>
        ))}
        {t.due && <Due iso={t.due} done={t.status === 'done'} prefix={t.status === 'done' ? 'Was due ' : ''} style={{ marginLeft: 4 }} />}
      </div>

      <div className="tk-detail">
        <div className="stack" style={{ gap: 18, minWidth: 0 }}>
          {t.details && (
            <div className="stack" style={{ gap: 4 }}>
              <div className="lbl">Details</div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t.details}</p>
            </div>
          )}

          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="lbl">Checklist{t.items.length ? ` · ${doneItems} of ${t.items.length}` : ''}</div>{t.items.length > 0 && <span className="mu num" style={{ fontSize: 13 }}>{pct}%</span>}</div>
            {t.items.length > 0 && <div className="bar" style={{ height: 6 }}><i style={{ width: `${pct}%`, display: 'block', height: '100%' }} /></div>}
            {t.items.map((it) => <ItemRow key={`${it.id}-${it.text}-${it.due}-${it.user}`} it={it} users={users} me={me} manage={manage} canWork={canWork} onChange={(a, d) => act(a, d)} />)}
            {canWork ? <AddItem users={users} onAdd={(d) => act('item.add', { taskId: t.id, ...d })} /> : !t.items.length && <span className="mu" style={{ fontSize: 13 }}>No checklist.</span>}
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <div className="lbl">Attachments{t.files.length ? ` · ${t.files.length}` : ''}</div>
            <div className="tk-files">
              {t.files.map((f) => (
                <div key={f.id} className="tk-file">
                  <a href={`/api/tasks/file/${f.id}`} target="_blank" rel="noopener" onClick={openFile(f)} style={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {f.mime.startsWith('image/') && !/heic|heif/.test(f.mime) ? <img src={`/api/tasks/file/${f.id}`} alt="" loading="lazy" /> : <div className="pdf">{f.mime === 'application/pdf' ? 'PDF' : 'PHOTO'}</div>}
                    <b>{f.name}</b>
                  </a>
                  <span className="mu">{mb(f.size)} · {f.userName}</span>
                  {(manage || f.user === me) && <button type="button" className="del" aria-label={`Delete ${f.name}`} onClick={() => { if (window.confirm(`Delete ${f.name}? It will be erased from the server.`)) act('file.delete', { id: f.id }, 'File deleted'); }}>✕</button>}
                </div>
              ))}
              {canWork && (
                <label className="tk-file add">
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles([...e.target.files])} />
                  {uploading ? <><span>Uploading…</span><span className="mu" style={{ fontWeight: 400 }}>{uploading}</span></> : <><Icon n="plus" />Add photo or PDF<span className="mu" style={{ fontWeight: 400 }}>up to 10 MB</span></>}
                </label>
              )}
            </div>
            {!canWork && !t.files.length && <span className="mu" style={{ fontSize: 13 }}>No files.</span>}
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <div className="lbl">Comments{t.comments.length ? ` · ${t.comments.length}` : ''}</div>
            {t.comments.map((c) => (
              <div key={c.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10 }}>
                <Avatar user={userById.get(c.user)} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b>{c.name}</b> <span className="mu" style={{ fontSize: 12.5 }}>{when(c.at)}</span>
                  {(c.user === me || manage) && <button type="button" className="btn sm ghost" style={{ minHeight: 22, padding: '0 6px', fontSize: 12 }} onClick={() => { if (window.confirm('Delete this comment?')) act('comment.delete', { id: c.id }); }}>Delete</button>}
                  <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</div>
                </div>
              </div>
            ))}
            <form className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (comment.trim() && (await act('comment.add', { taskId: t.id, body: comment }))) setComment(''); }}>
              <textarea className="inp" rows={1} style={{ minHeight: 44 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment. Everyone on the task is notified." maxLength={3000} />
              <button className="btn grn" disabled={busy || !comment.trim()}><Icon n="send" />Post</button>
            </form>
          </div>

          <details>
            <summary className="lbl" style={{ cursor: 'pointer' }}>History · {t.history.length} change{t.history.length === 1 ? '' : 's'}</summary>
            <ul className="mu" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
              {t.history.map((h, i) => <li key={i}>{h.actor} {h.text} · {when(h.at)}</li>)}
            </ul>
          </details>
        </div>

        <aside className="stack tk-side">
          <div className="stack" style={{ gap: 6 }}>
            <div className="lbl">People on this task</div>
            {t.people.map((p) => (
              <div key={p} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <Avatar user={userById.get(p)} /><span style={{ flex: 1, minWidth: 0 }}>{userById.get(p)?.name || 'Former user'}{p === me ? ' (you)' : ''}</span>
                {manage && <button type="button" className="btn sm ghost" aria-label={`Remove ${userById.get(p)?.name || ''}`} style={{ minHeight: 26, padding: 2 }} onClick={() => act('people', { id: t.id, remove: p })}>✕</button>}
              </div>
            ))}
            {!t.people.length && <span className="mu" style={{ fontSize: 13 }}>Nobody yet.</span>}
            {manage ? (
              <select className="inp" value="" onChange={(e) => e.target.value && act('people', { id: t.id, add: Number(e.target.value) })} aria-label="Add person">
                <option value="">+ Add person…</option>
                {users.filter((u) => !t.people.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : !onTask && !t.people.length && (
              <button type="button" className="btn sm grn" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => act('join', { id: t.id }, 'You joined this task')}><Icon n="plus" size={15} />Join this task</button>
            )}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <div className="lbl">Due</div>
            {t.due ? <><b>{longDue(t.due)}</b><span className="mu" style={{ fontSize: 12.5 }}>Reminders: 1 day before · on the day · 2 hours before · daily while overdue</span></> : <span className="mu">No due date</span>}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <div className="lbl">Created by</div>
            <span className="row" style={{ gap: 6 }}>{creator && <Avatar user={creator} size={22} />}{t.createdByName} · {when(t.createdAt)}</span>
          </div>
          {t.status === 'done' && t.doneAt && <span className="okmsg" style={{ fontSize: 13.5 }}>✓ Done {when(t.doneAt)}{userById.get(t.doneBy) ? ` by ${userById.get(t.doneBy).name}` : ''}</span>}
          {canWork && (t.status !== 'done'
            ? <button type="button" className="btn grn" style={{ minHeight: 48 }} disabled={busy} onClick={() => act('move', { id: t.id, status: 'done' }, 'Marked as done')}><Icon n="check" />Mark as done</button>
            : <button type="button" className="btn" disabled={busy} onClick={() => act('move', { id: t.id, status: 'doing' }, 'Task reopened')}>Reopen task</button>)}
        </aside>
      </div>
    </Modal>
  );
}
