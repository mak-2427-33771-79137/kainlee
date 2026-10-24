// Task board: loading, notifications, history and due-date reminders.
import { db } from './db';
import { notifyUsers } from './notify';
import { can } from './rbac';
import { fmtDate, fmtHrs } from './util';
import { getEvent } from './data';

export const STATUS = { todo: 'To do', doing: 'In progress', done: 'Done' };
export const PRIORITY = { high: 'High', normal: 'Normal', low: 'Low' };
export const LABEL_COLORS = ['#2fd486', '#ffc65c', '#5cb8ff', '#ff8fc7', '#b99bff', '#ff8a5c', '#7fe0e0', '#d0d6d2'];
const DEFAULT_LABELS = [['Venue', '#2fd486'], ['Catering', '#ffc65c'], ['Transport', '#5cb8ff'], ['Decoration', '#ff8fc7'], ['Invitations', '#b99bff']];
const PEOPLE_COLORS = ['#2fd486', '#5cb8ff', '#ffb35c', '#d38bff', '#ff7a8a', '#7fe0e0', '#ffd65c', '#9fd36b', '#ff9ec7', '#a9b8ff'];

export const canManage = (u) => can(u.role, 'tasks.manage');

/** "Col R K Thapa" -> RT, "Maj A Gurung" -> AG, "Mak" -> MA */
export function initials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return ((w.length > 2 ? w[1] : w[0])[0] + w[w.length - 1][0]).toUpperCase();
}
export const personColor = (id) => PEOPLE_COLORS[(Number(id) || 0) % PEOPLE_COLORS.length];

export async function taskUsers() {
  const k = await db();
  const rows = await k('users').where({ active: true }).select('id', 'name').orderBy('name');
  return rows.map((r) => ({ id: r.id, name: r.name, ini: initials(r.name), color: personColor(r.id) }));
}

/** Labels of an event; a fresh board gets a few common ones to start with. */
export async function eventLabels(eventId) {
  const k = await db();
  let rows = await k('task_labels').where({ event_id: eventId }).orderBy(['sort', 'id']);
  // starter labels for a fresh board (no labels and no tasks yet)
  if (!rows.length && !(await k('tasks').where({ event_id: eventId }).first())) {
    await k('task_labels').insert(DEFAULT_LABELS.map(([name, color], i) => ({ event_id: eventId, name, color, sort: i })));
    rows = await k('task_labels').where({ event_id: eventId }).orderBy(['sort', 'id']);
  }
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Cards for the board (or for "My tasks" when userId is given and eventId is null). */
export async function loadCards({ eventId = null, userId = null, includeOldDone = false }) {
  const k = await db();
  const q = k('tasks as t').select('t.*');
  if (eventId) q.where('t.event_id', eventId);
  if (userId) {
    q.where((w) => w.whereIn('t.id', k('task_people').where({ user_id: userId }).select('task_id'))
      .orWhereIn('t.id', k('task_items').where({ user_id: userId, done: false }).select('task_id')));
  }
  if (!includeOldDone) q.where((w) => w.whereNot('t.status', 'done').orWhere('t.done_at', '>', new Date(Date.now() - 7 * 86400e3)).orWhereNull('t.done_at'));
  const tasks = await q.orderBy([{ column: 't.sort' }, { column: 't.id' }]);
  if (!tasks.length) return [];
  const ids = tasks.map((t) => t.id);
  const [people, links, items, comments, files] = await Promise.all([
    k('task_people').whereIn('task_id', ids).orderBy('added_at'),
    k('task_label_links').whereIn('task_id', ids),
    k('task_items').whereIn('task_id', ids).select('task_id', 'done', 'user_id', 'due_at', 'text', 'id'),
    k('task_comments').whereIn('task_id', ids).groupBy('task_id').select('task_id').count({ n: '*' }),
    k('task_files').whereIn('task_id', ids).groupBy('task_id').select('task_id').count({ n: '*' }),
  ]);
  const by = (rows, key = 'task_id') => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };
  const P = by(people); const L = by(links); const I = by(items);
  const C = new Map(comments.map((r) => [r.task_id, Number(r.n)])); const F = new Map(files.map((r) => [r.task_id, Number(r.n)]));
  return tasks.map((t) => {
    const its = I.get(t.id) || [];
    const mine = userId ? its.filter((i) => i.user_id === userId && !i.done).map((i) => ({ id: i.id, text: i.text, due: iso(i.due_at) })) : undefined;
    return {
      id: t.id, eventId: t.event_id, title: t.title, status: t.status, priority: t.priority, due: iso(t.due_at), doneAt: iso(t.done_at),
      people: (P.get(t.id) || []).map((p) => p.user_id), labels: (L.get(t.id) || []).map((l) => l.label_id),
      items: [its.filter((i) => i.done).length, its.length], comments: C.get(t.id) || 0, files: F.get(t.id) || 0, mine,
      doneBy: t.done_by || null,
    };
  });
}

export async function loadTask(id) {
  const k = await db();
  const t = await k('tasks').where({ id }).first();
  if (!t) return null;
  const [people, links, items, comments, files, history] = await Promise.all([
    k('task_people').where({ task_id: id }).orderBy('added_at'),
    k('task_label_links').where({ task_id: id }),
    k('task_items').where({ task_id: id }).orderBy(['sort', 'id']),
    k('task_comments').where({ task_id: id }).orderBy('id'),
    k('task_files').where({ task_id: id }).orderBy('id'),
    k('task_history').where({ task_id: id }).orderBy('id', 'desc').limit(200),
  ]);
  return {
    id: t.id, eventId: t.event_id, title: t.title, details: t.details || '', status: t.status, priority: t.priority, due: iso(t.due_at),
    createdBy: t.created_by, createdByName: t.created_by_name, createdAt: iso(t.created_at), doneAt: iso(t.done_at), doneBy: t.done_by,
    people: people.map((p) => p.user_id), labels: links.map((l) => l.label_id),
    items: items.map((i) => ({ id: i.id, text: i.text, done: !!i.done, user: i.user_id, due: iso(i.due_at) })),
    comments: comments.map((c) => ({ id: c.id, user: c.user_id, name: c.user_name, body: c.body, at: iso(c.created_at) })),
    files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, user: f.user_id, userName: f.user_name, at: iso(f.created_at) })),
    history: history.map((h) => ({ actor: h.actor, text: h.text, at: iso(h.at) })),
  };
}

export async function history(taskId, user, text, trx) {
  const k = trx || (await db());
  await k('task_history').insert({ task_id: taskId, actor: user ? String(user.name).slice(0, 160) : 'System', text: String(text).slice(0, 500), at: new Date() });
}

export const taskUrl = (t) => `/admin/e/${t.event_id ?? t.eventId}/tasks?t=${t.id}`;
export const dueText = (d) => (d ? `${fmtDate(d).replace(/ \d{4}$/, '')} ${fmtHrs(d)}` : '');

/** Notify these users about a task (never the person who made the change). */
export async function tell(task, userIds, actor, title, body) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))].filter((id) => id !== actor?.id);
  if (!ids.length) return;
  await notifyUsers(ids, { eventId: task.event_id ?? task.eventId, title: String(title).slice(0, 160), body: body ? String(body).slice(0, 500) : null, url: taskUrl(task) });
}

export async function peopleOf(taskId) {
  const k = await db();
  return (await k('task_people').where({ task_id: taskId })).map((r) => r.user_id);
}

/** Start of a given IST calendar day (YYYY-MM-DD) at hh:00 IST, as a Date */
const istAt = (day, hh) => new Date(`${day}T${String(hh).padStart(2, '0')}:00:00+05:30`);
const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const istHour = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).getUTCHours();
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

async function once(k, key) {
  try { await k('task_reminders').insert({ dedupe: key.slice(0, 120), sent_at: new Date() }); return true; } catch (e) {
    if (/duplicate|unique|primary/i.test(String(e.message))) return false;
    throw e;
  }
}

/**
 * Due-date reminders (run every few minutes).
 *  - 1 day before (0900 hrs IST), on the due day (0800 hrs), 2 hours before the due time,
 *    and every day while overdue (0900 hrs) to the people on the task;
 *  - once to the creator the day after it was due;
 *  - checklist items with their own person and due date: 1 day before, on the day, daily while overdue.
 * A reminder whose moment was before the due date was set is skipped (they have just set it).
 */
export async function runTaskReminders(now = new Date()) {
  const k = await db();
  const out = { sent: 0 };
  const today = istDay(now); const hour = istHour(now);
  const daytime = hour >= 8 && hour < 21;
  const horizon = new Date(now.getTime() + 2 * 86400e3);
  const tasks = await k('tasks').whereNot('status', 'done').whereNotNull('due_at').where('due_at', '<', horizon);
  for (const t of tasks) {
    const due = new Date(t.due_at); const set = t.due_set_at ? new Date(t.due_set_at) : new Date(0);
    const dueDay = istDay(due); const stamp = due.getTime();
    const people = await peopleOf(t.id);
    const ok = (trigger) => now >= trigger && trigger >= set;
    const send = async (key, ids, title, body) => { if (ids.length && (await once(k, key))) { await tell(t, ids, null, title, body); out.sent++; } };
    if (dueDay === addDays(today, 1) && daytime && ok(istAt(addDays(dueDay, -1), 9))) await send(`t${t.id}:d1:${stamp}`, people, `Due tomorrow: ${t.title}`, `Due ${dueText(due)}.`);
    if (dueDay === today && due > now && daytime && ok(istAt(today, 8))) await send(`t${t.id}:d0:${stamp}`, people, `Due today: ${t.title}`, `Due at ${fmtHrs(due)}.`);
    const h2 = new Date(stamp - 2 * 3600e3);
    if (now < due && ok(h2)) await send(`t${t.id}:h2:${stamp}`, people, `Due in 2 hours: ${t.title}`, `Due at ${fmtHrs(due)}.`);
    if (today > dueDay && hour >= 9 && hour < 21) {
      await send(`t${t.id}:od:${today}`, people, `Overdue: ${t.title}`, `It was due ${dueText(due)}. Mark it done when finished.`);
      if (t.created_by && !people.includes(t.created_by)) await send(`t${t.id}:oc:${stamp}`, [t.created_by], `Overdue: ${t.title}`, `A task you created was due ${dueText(due)} and is not done yet.`);
    }
  }
  const items = await k('task_items as i').join('tasks as t', 't.id', 'i.task_id').where('i.done', false).whereNot('t.status', 'done')
    .whereNotNull('i.user_id').whereNotNull('i.due_at').where('i.due_at', '<', horizon)
    .select('i.*', 't.event_id', 't.title as task_title');
  for (const i of items) {
    const due = new Date(i.due_at); const set = i.due_set_at ? new Date(i.due_set_at) : new Date(0);
    const dueDay = istDay(due); const stamp = due.getTime();
    const task = { id: i.task_id, event_id: i.event_id };
    const ok = (trigger) => now >= trigger && trigger >= set;
    const send = async (key, title, body) => { if (await once(k, key)) { await tell(task, [i.user_id], null, title, body); out.sent++; } };
    const where = `In “${i.task_title}”.`;
    if (dueDay === addDays(today, 1) && daytime && ok(istAt(addDays(dueDay, -1), 9))) await send(`i${i.id}:d1:${stamp}`, `Due tomorrow: ${i.text}`, `${where} Due ${dueText(due)}.`);
    if (dueDay === today && due > now && daytime && ok(istAt(today, 8))) await send(`i${i.id}:d0:${stamp}`, `Due today: ${i.text}`, `${where} Due at ${fmtHrs(due)}.`);
    if (today > dueDay && hour >= 9 && hour < 21) await send(`i${i.id}:od:${today}`, `Overdue: ${i.text}`, `${where} It was due ${dueText(due)}.`);
  }
  if (Math.random() < 0.02) await k('task_reminders').where('sent_at', '<', new Date(now.getTime() - 90 * 86400e3)).del();
  return out;
}

export function startTaskWorker() {
  const G = globalThis;
  if (G.__klTasks) return;
  const run = () => runTaskReminders().catch((e) => console.error('[tasks] reminders', e.message));
  G.__klTasks = setInterval(run, 5 * 60000);
  setTimeout(run, 30000);
}

/** When a task copies from an earlier event: shift due dates by the gap between the two events. */
export async function eventStart(eventId) {
  const ev = await getEvent(eventId);
  if (!ev) return null;
  const fns = [...(ev.functions || [])].filter((f) => f.starts_at).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  return fns[0]?.starts_at ? new Date(fns[0].starts_at) : ev.starts_at ? new Date(ev.starts_at) : null;
}
