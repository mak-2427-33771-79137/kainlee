// Upload a photo or PDF to a task (multipart: taskId, file). Up to 10 MB; the real type is
// checked from the file's first bytes. Stored privately on disk (lib/taskFiles.js).
import { handler, bad, audit } from '@/lib/api';
import { db } from '@/lib/db';
import { getAdmin, HttpError } from '@/lib/auth';
import { canManage, history, loadTask, peopleOf } from '@/lib/tasks';
import { MAX_FILE, ALLOWED, sniff, saveFile, eraseFiles } from '@/lib/taskFiles';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const u = await getAdmin();
  if (!u) throw new HttpError(401, 'Please log in again.');
  let form;
  try { form = await req.formData(); } catch { bad('The file could not be read. It may be larger than 10 MB.'); }
  const k = await db();
  const t = await k('tasks').where({ id: Number(form.get('taskId')) || 0 }).first();
  if (!t) bad('This task no longer exists.', 404);
  if (!canManage(u) && !(await peopleOf(t.id)).includes(u.id)) bad('Only the people on this task (or a task manager) can add files.', 403);
  const file = form.get('file');
  if (!file || typeof file === 'string') bad('Choose a photo or PDF.');
  if (file.size > MAX_FILE) bad('That file is larger than 10 MB.');
  if (!file.size) bad('That file is empty.');
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf, file.type);
  if (!mime || !ALLOWED[mime]) bad('Only photos (JPG, PNG, WEBP, HEIC) and PDF files can be attached.');
  const count = await k('task_files').where({ task_id: t.id }).count({ n: '*' }).first();
  if (Number(count.n) >= 30) bad('A task can have up to 30 files. Delete one first.');
  const name = String(file.name || 'file').replace(/[\\/\r\n\t"<>]+/g, '_').trim().slice(0, 180) || 'file';
  const stored = await saveFile(buf, mime);
  try {
    await k('task_files').insert({ task_id: t.id, name, mime, size: buf.length, stored, user_id: u.id, user_name: u.name, created_at: new Date() });
  } catch (e) { await eraseFiles([stored]); throw e; }
  await k('tasks').where({ id: t.id }).update({ updated_at: new Date() });
  await history(t.id, u, `attached ${name}`);
  await audit({ user: u, eventId: t.event_id, action: 'task.file.add', details: `${t.title}: ${name} (${Math.round(buf.length / 1024)} KB)`, req });
  return { task: await loadTask(t.id) };
});
