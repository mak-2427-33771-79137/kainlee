// Task board API. Everyone logged in can see the board, join an open task, comment, and work
// on tasks they are on (move, checklist, files, mark done). "Manage tasks" can create, edit,
// assign, delete, manage labels and copy tasks from an earlier event.
import { handler, body, bad, audit } from '@/lib/api';
import { db } from '@/lib/db';
import { getAdmin, HttpError } from '@/lib/auth';
import { getEvent, listEvents } from '@/lib/data';
import { istInputToDate } from '@/lib/util';
import {
  STATUS, PRIORITY, LABEL_COLORS, canManage, taskUsers, eventLabels, loadCards, loadTask, history, tell, peopleOf, dueText, eventStart,
} from '@/lib/tasks';
import { eraseFilesOfTasks, eraseFiles } from '@/lib/taskFiles';

export const dynamic = 'force-dynamic';

const int = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const text = (v, n) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, n);
const oneLine = (v, n) => text(v, n).replace(/\s+/g, ' ');
const due = (v) => { if (v == null || v === '') return null; const d = istInputToDate(v); if (!d) bad('That due date is not valid.'); return d; };
const same = (a, b) => String(a ? new Date(a).getTime() : '') === String(b ? new Date(b).getTime() : '');

async function needTask(id) {
  const k = await db();
  const t = await k('tasks').where({ id: int(id) || 0 }).first();
  if (!t) bad('This task no longer exists. It may have been deleted.', 404);
  return t;
}
async function needEventId(id) {
  const ev = await getEvent(int(id) || 0);
  if (!ev) bad('Event not found.', 404);
  return ev;
}
function mustManage(u) { if (!canManage(u)) bad('Only people with the “Manage tasks” role can do this.', 403); }
async function mustWork(u, t) {
  if (canManage(u)) return;
  if (!(await peopleOf(t.id)).includes(u.id)) bad('Only the people on this task (or a task manager) can do this.', 403);
}
async function validUsers(ids) {
  const k = await db();
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(int).filter(Boolean))];
  if (!want.length) return [];
  return (await k('users').whereIn('id', want).where({ active: true }).select('id')).map((r) => r.id);
}
async function validLabels(eventId, ids) {
  const k = await db();
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(int).filter(Boolean))];
  if (!want.length) return [];
  return (await k('task_labels').whereIn('id', want).where({ event_id: eventId }).select('id')).map((r) => r.id);
}
async function names(ids) {
  if (!ids.length) return [];
  const k = await db();
  const rows = await k('users').whereIn('id', ids).select('id', 'name');
  return ids.map((id) => rows.find((r) => r.id === id)?.name || `#${id}`);
}
const touch = async (id) => (await db())('tasks').where({ id }).update({ updated_at: new Date() });
const fresh = async (id) => ({ task: await loadTask(id) });

const A = {};

// ---------------------------------------------------------------- reading
A.board = async (u, b) => {
  const ev = await needEventId(b.eventId);
  return {
    labels: await eventLabels(ev.id), users: await taskUsers(),
    cards: await loadCards({ eventId: ev.id, includeOldDone: !!b.all }),
    me: u.id, manage: canManage(u),
  };
};

A.my = async (u, b) => {
  const cards = (await loadCards({ userId: u.id, includeOldDone: !!b.all })).filter((c) => (b.all || c.status !== 'done') && (!int(b.eventId) || c.eventId === int(b.eventId)));
  const evs = new Map((await listEvents()).map((e) => [e.id, e.name]));
  const k = await db();
  const ids = [...new Set(cards.map((c) => c.eventId))];
  const labels = ids.length ? await k('task_labels').whereIn('event_id', ids) : [];
  return { cards: cards.map((c) => ({ ...c, eventName: evs.get(c.eventId) || '' })), labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })), users: await taskUsers(), me: u.id };
};

A.get = async (u, b) => {
  const t = await loadTask(int(b.id) || 0);
  if (!t) bad('This task no longer exists. It may have been deleted.', 404);
  return { task: t };
};

// ---------------------------------------------------------------- create / edit / delete
A.create = async (u, b, req) => {
  mustManage(u);
  const ev = await needEventId(b.eventId);
  const title = oneLine(b.title, 200);
  if (title.length < 2) bad('Give the task a title.');
  const status = STATUS[b.status] ? b.status : 'todo';
  const priority = PRIORITY[b.priority] ? b.priority : 'normal';
  const dueAt = due(b.due);
  const people = await validUsers(b.people);
  const labels = await validLabels(ev.id, b.labels);
  const k = await db();
  const min = await k('tasks').where({ event_id: ev.id, status }).min({ m: 'sort' }).first();
  const now = new Date();
  const [id] = await k('tasks').insert({
    event_id: ev.id, title, details: text(b.details, 5000) || null, status, priority, due_at: dueAt, due_set_at: dueAt ? now : null,
    sort: (Number(min?.m) || 0) - 1, created_by: u.id, created_by_name: u.name, created_at: now, updated_at: now,
    ...(status === 'done' ? { done_at: now, done_by: u.id } : {}),
  });
  if (people.length) await k('task_people').insert(people.map((p) => ({ task_id: id, user_id: p, added_at: now })));
  if (labels.length) await k('task_label_links').insert(labels.map((l) => ({ task_id: id, label_id: l })));
  await history(id, u, `created this task${people.length ? ` for ${(await names(people)).join(', ')}` : ''}`);
  await audit({ user: u, eventId: ev.id, action: 'task.create', details: title, req });
  await tell({ id, event_id: ev.id }, people, u, `${u.name} gave you a task: ${title}`, dueAt ? `Due ${dueText(dueAt)}.` : null);
  return fresh(id);
};

A.update = async (u, b, req) => {
  mustManage(u);
  const t = await needTask(b.id);
  const k = await db();
  const row = {}; const changes = [];
  if (b.title != null) { const v = oneLine(b.title, 200); if (v.length < 2) bad('Give the task a title.'); if (v !== t.title) { row.title = v; changes.push(`renamed it to “${v}”`); } }
  if (b.details != null) { const v = text(b.details, 5000) || null; if ((v || '') !== (t.details || '')) { row.details = v; changes.push('changed the details'); } }
  if (b.priority != null && PRIORITY[b.priority] && b.priority !== t.priority) { row.priority = b.priority; changes.push(`set priority to ${PRIORITY[b.priority]}`); }
  let dueChanged = false;
  if (b.due !== undefined) {
    const v = due(b.due);
    if (!same(v, t.due_at)) { row.due_at = v; row.due_set_at = v ? new Date() : null; dueChanged = true; changes.push(v ? `changed the due date to ${dueText(v)}` : 'removed the due date'); }
  }
  if (Object.keys(row).length) await k('tasks').where({ id: t.id }).update({ ...row, updated_at: new Date() });
  if (Array.isArray(b.labels)) {
    const want = await validLabels(t.event_id, b.labels);
    const have = (await k('task_label_links').where({ task_id: t.id })).map((r) => r.label_id);
    if (want.sort().join() !== have.sort().join()) {
      await k('task_label_links').where({ task_id: t.id }).del();
      if (want.length) await k('task_label_links').insert(want.map((l) => ({ task_id: t.id, label_id: l })));
      changes.push('changed the labels');
    }
  }
  for (const c of changes) await history(t.id, u, c);
  const title = row.title || t.title;
  const ppl = await peopleOf(t.id);
  if (dueChanged) await tell(t, ppl, u, `Due date changed: ${title}`, row.due_at ? `Now due ${dueText(row.due_at)}.` : 'The due date was removed.');
  const other = changes.filter((c) => !c.startsWith('changed the due') && !c.startsWith('removed the due'));
  if (other.length) await tell(t, ppl, u, `Task edited: ${title}`, `${u.name} ${other.join(', ')}.`);
  if (Array.isArray(b.people)) await setPeople(u, t, await validUsers(b.people));
  if (changes.length) await audit({ user: u, eventId: t.event_id, action: 'task.edit', details: `${title}: ${changes.join('; ')}`, req });
  return fresh(t.id);
};

async function setPeople(u, t, want) {
  const k = await db();
  const have = await peopleOf(t.id);
  const add = want.filter((x) => !have.includes(x));
  const rem = have.filter((x) => !want.includes(x));
  if (add.length) await k('task_people').insert(add.map((p) => ({ task_id: t.id, user_id: p, added_at: new Date() })));
  if (rem.length) await k('task_people').where({ task_id: t.id }).whereIn('user_id', rem).del();
  if (add.length) { await history(t.id, u, `added ${(await names(add)).join(', ')}`); await tell(t, add, u, `${u.name} added you to a task: ${t.title}`, t.due_at ? `Due ${dueText(t.due_at)}.` : null); }
  if (rem.length) { await history(t.id, u, `removed ${(await names(rem)).join(', ')}`); await tell(t, rem, u, `You were removed from a task: ${t.title}`, `By ${u.name}.`); }
  if (add.length || rem.length) await touch(t.id);
}

A.people = async (u, b) => {
  mustManage(u);
  const t = await needTask(b.id);
  const have = await peopleOf(t.id);
  const add = await validUsers(b.add ? [b.add] : []);
  const rem = int(b.remove);
  await setPeople(u, t, [...have.filter((x) => x !== rem), ...add.filter((x) => !have.includes(x))]);
  return fresh(t.id);
};

A.join = async (u, b) => {
  const t = await needTask(b.id);
  const ppl = await peopleOf(t.id);
  if (ppl.includes(u.id)) return fresh(t.id);
  if (ppl.length && !canManage(u)) bad('Someone is already on this task. Ask a task manager to add you.');
  const k = await db();
  await k('task_people').insert({ task_id: t.id, user_id: u.id, added_at: new Date() });
  await history(t.id, u, 'joined this task');
  await touch(t.id);
  await tell(t, [t.created_by, ...ppl], u, `${u.name} took a task: ${t.title}`, null);
  return fresh(t.id);
};

A.delete = async (u, b, req) => {
  mustManage(u);
  const t = await needTask(b.id);
  const k = await db();
  const ppl = await peopleOf(t.id);
  const files = await eraseFilesOfTasks(k, [t.id]);
  await k('tasks').where({ id: t.id }).del();
  await audit({ user: u, eventId: t.event_id, action: 'task.delete', details: `${t.title} (${files} file(s) erased)`, req });
  await tell(t, [...ppl, t.created_by], u, `Task deleted: ${t.title}`, `By ${u.name}.`);
  return { ok: true, files };
};

// ---------------------------------------------------------------- moving
async function setStatus(u, t, status) {
  if (!STATUS[status] || status === t.status) return false;
  const k = await db();
  const now = new Date();
  await k('tasks').where({ id: t.id }).update({ status, updated_at: now, ...(status === 'done' ? { done_at: now, done_by: u.id } : { done_at: null, done_by: null }) });
  const ppl = await peopleOf(t.id);
  if (status === 'done') {
    await history(t.id, u, 'marked this as done');
    await tell(t, [t.created_by, ...ppl], u, `✓ Done: ${t.title}`, `Marked done by ${u.name}.`);
  } else if (t.status === 'done') {
    await history(t.id, u, `reopened this (moved to ${STATUS[status]})`);
    await tell(t, [t.created_by, ...ppl], u, `Task reopened: ${t.title}`, `${u.name} moved it back to ${STATUS[status]}.`);
  } else {
    await history(t.id, u, `moved this to ${STATUS[status]}`);
    await tell(t, [t.created_by, ...ppl], u, `${STATUS[status]}: ${t.title}`, `Moved by ${u.name}.`);
  }
  return true;
}

A.move = async (u, b, req) => {
  const t = await needTask(b.id);
  await mustWork(u, t);
  const status = STATUS[b.status] ? b.status : t.status;
  const changed = await setStatus(u, t, status);
  if (Array.isArray(b.order)) {
    const k = await db();
    const ids = b.order.map(int).filter(Boolean).slice(0, 500);
    const rows = await k('tasks').whereIn('id', ids).where({ event_id: t.event_id }).select('id');
    const okIds = new Set(rows.map((r) => r.id));
    let i = 0;
    for (const id of ids) if (okIds.has(id)) await k('tasks').where({ id }).update({ sort: i++ });
  }
  if (changed) await audit({ user: u, eventId: t.event_id, action: 'task.move', details: `${t.title} → ${STATUS[status]}`, req });
  return fresh(t.id);
};

// ---------------------------------------------------------------- checklist
async function itemUserOnTask(u, t, userId) {
  // the person given a checklist item is added to the task, so they see it under "My tasks"
  const ppl = await peopleOf(t.id);
  if (userId && !ppl.includes(userId)) {
    const k = await db();
    await k('task_people').insert({ task_id: t.id, user_id: userId, added_at: new Date() });
    await history(t.id, u, `added ${(await names([userId]))[0]}`);
  }
}
A['item.add'] = async (u, b) => {
  const t = await needTask(b.taskId);
  await mustWork(u, t);
  const txt = oneLine(b.text, 300);
  if (!txt) bad('Write the checklist item.');
  const [user] = await validUsers(b.user ? [b.user] : []);
  const d = due(b.due);
  const k = await db();
  const max = await k('task_items').where({ task_id: t.id }).max({ m: 'sort' }).first();
  await k('task_items').insert({ task_id: t.id, text: txt, user_id: user || null, due_at: d, due_set_at: d ? new Date() : null, sort: (Number(max?.m) || 0) + 1 });
  await itemUserOnTask(u, t, user);
  await history(t.id, u, `added checklist item “${txt}”`);
  await touch(t.id);
  if (user) await tell(t, [user], u, `${u.name} gave you a checklist item: ${txt}`, `In “${t.title}”${d ? `, due ${dueText(d)}` : ''}.`);
  return fresh(t.id);
};
A['item.update'] = async (u, b) => {
  const k = await db();
  const it = await k('task_items').where({ id: int(b.id) || 0 }).first();
  if (!it) bad('Checklist item not found.', 404);
  const t = await needTask(it.task_id);
  await mustWork(u, t);
  const row = {};
  if (b.text != null) { const v = oneLine(b.text, 300); if (!v) bad('Write the checklist item.'); row.text = v; }
  let newUser = null;
  if (b.user !== undefined) { const [v] = await validUsers(b.user ? [b.user] : []); row.user_id = v || null; if (v && v !== it.user_id) newUser = v; }
  let dueChanged = false;
  if (b.due !== undefined) { const v = due(b.due); if (!same(v, it.due_at)) { row.due_at = v; row.due_set_at = v ? new Date() : null; dueChanged = true; } }
  if (Object.keys(row).length) await k('task_items').where({ id: it.id }).update(row);
  const label = row.text || it.text;
  if (newUser) { await itemUserOnTask(u, t, newUser); await tell(t, [newUser], u, `${u.name} gave you a checklist item: ${label}`, `In “${t.title}”${(row.due_at ?? it.due_at) ? `, due ${dueText(row.due_at ?? it.due_at)}` : ''}.`); }
  else if (dueChanged && it.user_id) await tell(t, [it.user_id], u, `Due date changed: ${label}`, `In “${t.title}”. ${row.due_at ? `Now due ${dueText(row.due_at)}.` : 'The due date was removed.'}`);
  await history(t.id, u, `edited checklist item “${label}”`);
  await touch(t.id);
  return fresh(t.id);
};
A['item.toggle'] = async (u, b) => {
  const k = await db();
  const it = await k('task_items').where({ id: int(b.id) || 0 }).first();
  if (!it) bad('Checklist item not found.', 404);
  const t = await needTask(it.task_id);
  if (!canManage(u) && it.user_id !== u.id) await mustWork(u, t);
  const done = !!b.done;
  await k('task_items').where({ id: it.id }).update({ done, done_by: done ? u.id : null, done_at: done ? new Date() : null });
  await history(t.id, u, `${done ? 'ticked' : 'unticked'} “${it.text}”`);
  await touch(t.id);
  return fresh(t.id);
};
A['item.delete'] = async (u, b) => {
  const k = await db();
  const it = await k('task_items').where({ id: int(b.id) || 0 }).first();
  if (!it) bad('Checklist item not found.', 404);
  const t = await needTask(it.task_id);
  await mustWork(u, t);
  await k('task_items').where({ id: it.id }).del();
  await history(t.id, u, `removed checklist item “${it.text}”`);
  return fresh(t.id);
};

// ---------------------------------------------------------------- comments & files
A['comment.add'] = async (u, b) => {
  const t = await needTask(b.taskId);
  const txt = text(b.body, 3000);
  if (!txt) bad('Write a comment first.');
  const k = await db();
  await k('task_comments').insert({ task_id: t.id, user_id: u.id, user_name: u.name, body: txt, created_at: new Date() });
  await touch(t.id);
  await tell(t, [...(await peopleOf(t.id)), t.created_by], u, `${u.name} commented on: ${t.title}`, txt.slice(0, 180));
  return fresh(t.id);
};
A['comment.delete'] = async (u, b) => {
  const k = await db();
  const c = await k('task_comments').where({ id: int(b.id) || 0 }).first();
  if (!c) bad('Comment not found.', 404);
  if (c.user_id !== u.id && !canManage(u)) bad('You can delete only your own comments.', 403);
  await k('task_comments').where({ id: c.id }).del();
  return fresh(c.task_id);
};
A['file.delete'] = async (u, b, req) => {
  const k = await db();
  const f = await k('task_files').where({ id: int(b.id) || 0 }).first();
  if (!f) bad('File not found.', 404);
  if (f.user_id !== u.id && !canManage(u)) bad('Only the person who added it (or a task manager) can delete this file.', 403);
  await eraseFiles([f.stored]);
  await k('task_files').where({ id: f.id }).del();
  const t = await needTask(f.task_id);
  await history(t.id, u, `deleted the file ${f.name}`);
  await audit({ user: u, eventId: t.event_id, action: 'task.file.delete', details: `${t.title}: ${f.name}`, req });
  return fresh(t.id);
};

// ---------------------------------------------------------------- labels & copying
A.labels = async (u, b, req) => {
  mustManage(u);
  const ev = await needEventId(b.eventId);
  const k = await db();
  const list = (Array.isArray(b.labels) ? b.labels : []).slice(0, 30)
    .map((l, i) => ({ id: int(l.id), name: oneLine(l.name, 40), color: LABEL_COLORS.includes(l.color) ? l.color : LABEL_COLORS[i % LABEL_COLORS.length], sort: i }))
    .filter((l) => l.name);
  const have = (await k('task_labels').where({ event_id: ev.id })).map((r) => r.id);
  const keep = list.filter((l) => l.id && have.includes(l.id)).map((l) => l.id);
  const gone = have.filter((id) => !keep.includes(id));
  if (gone.length) await k('task_labels').whereIn('id', gone).del();
  for (const l of list) {
    if (l.id && have.includes(l.id)) await k('task_labels').where({ id: l.id }).update({ name: l.name, color: l.color, sort: l.sort });
    else await k('task_labels').insert({ event_id: ev.id, name: l.name, color: l.color, sort: l.sort });
  }
  await audit({ user: u, eventId: ev.id, action: 'task.labels', details: list.map((l) => l.name).join(', '), req });
  return { labels: await eventLabels(ev.id) };
};

A.sources = async (u, b) => {
  mustManage(u);
  const k = await db();
  const rows = await k('tasks').whereNot('event_id', int(b.eventId) || 0).groupBy('event_id').select('event_id').count({ n: '*' });
  const evs = await listEvents();
  return { events: rows.map((r) => ({ id: r.event_id, name: evs.find((e) => e.id === r.event_id)?.name || `#${r.event_id}`, n: Number(r.n) })) };
};

A.copy = async (u, b, req) => {
  mustManage(u);
  const ev = await needEventId(b.eventId);
  const src = await needEventId(b.fromEventId);
  if (src.id === ev.id) bad('Choose a different event to copy from.');
  const k = await db();
  const [a, z] = await Promise.all([eventStart(src.id), eventStart(ev.id)]);
  const shift = a && z ? z.getTime() - a.getTime() : null;
  const move = (d) => (d && shift != null ? new Date(new Date(d).getTime() + shift) : null);
  // labels by name
  const srcLabels = await k('task_labels').where({ event_id: src.id });
  await eventLabels(ev.id);
  let mine = await k('task_labels').where({ event_id: ev.id });
  for (const l of srcLabels) if (!mine.some((m) => m.name.toLowerCase() === l.name.toLowerCase())) await k('task_labels').insert({ event_id: ev.id, name: l.name, color: l.color, sort: mine.length + 1 });
  mine = await k('task_labels').where({ event_id: ev.id });
  const labelMap = new Map(srcLabels.map((l) => [l.id, mine.find((m) => m.name.toLowerCase() === l.name.toLowerCase())?.id]));
  const existing = new Set((await k('tasks').where({ event_id: ev.id }).select('title')).map((r) => r.title.toLowerCase()));
  const tasks = await k('tasks').where({ event_id: src.id }).orderBy(['status', 'sort', 'id']);
  let n = 0; let skipped = 0; const now = new Date();
  for (const t of tasks) {
    if (existing.has(t.title.toLowerCase())) { skipped++; continue; }
    const d = move(t.due_at);
    const [id] = await k('tasks').insert({
      event_id: ev.id, title: t.title, details: t.details, status: 'todo', priority: t.priority, due_at: d, due_set_at: d ? now : null,
      sort: n, created_by: u.id, created_by_name: u.name, created_at: now, updated_at: now,
    });
    const links = (await k('task_label_links').where({ task_id: t.id })).map((l) => labelMap.get(l.label_id)).filter(Boolean);
    if (links.length) await k('task_label_links').insert([...new Set(links)].map((l) => ({ task_id: id, label_id: l })));
    const items = await k('task_items').where({ task_id: t.id }).orderBy(['sort', 'id']);
    if (items.length) await k('task_items').insert(items.map((i) => { const di = move(i.due_at); return { task_id: id, text: i.text, sort: i.sort, due_at: di, due_set_at: di ? now : null }; }));
    await history(id, u, `copied this from ${src.name}`);
    n++;
  }
  await audit({ user: u, eventId: ev.id, action: 'task.copy', details: `${n} task(s) from ${src.name}${skipped ? `, ${skipped} skipped (same title already here)` : ''}`, req });
  return { copied: n, skipped, shifted: shift != null };
};

// automated tests only: run the reminder check as if it were a given time
A['test.reminders'] = async (u, b) => {
  if (process.env.KL_TEST !== '1') bad('Not allowed', 403);
  const { runTaskReminders } = await import('@/lib/tasks');
  return runTaskReminders(new Date(b.at));
};

export const POST = handler(async (req) => {
  const user = await getAdmin();
  if (!user) throw new HttpError(401, 'Please log in again.');
  const b = await body(req);
  const fn = A[b.action];
  if (!fn) bad('Unknown action');
  return fn(user, b, req);
});
