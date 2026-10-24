// Files attached to tasks (photos, PDFs). Kept on the server's disk OUTSIDE the app folder,
// so a redeploy never wipes them and they are never public: they are only served through
// /api/admin/tasks/file/<id> to logged-in users. Deleting a task erases its files from disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const MAX_FILE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

export function filesDir() {
  return process.env.TASK_FILES_DIR || path.join(os.homedir(), 'kainlee-files', 'tasks');
}

const safe = (stored) => {
  if (!/^[a-zA-Z0-9_-]{16,60}\.[a-z]{3,4}$/.test(String(stored))) throw new Error('bad file name');
  return path.join(filesDir(), stored);
};

/** Check the real file type from its first bytes (not just what the browser claims). */
export function sniff(buf, claimed) {
  const b = buf.subarray(0, 16);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (b.toString('latin1', 4, 8) === 'ftyp' && /heic|heix|mif1|msf1|heif/.test(b.toString('latin1', 8, 12))) return claimed === 'image/heif' ? 'image/heif' : 'image/heic';
  return null;
}

export async function saveFile(buf, mime) {
  const dir = filesDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const stored = `${crypto.randomBytes(18).toString('base64url')}.${ALLOWED[mime]}`;
  await fs.writeFile(safe(stored), buf, { mode: 0o600, flag: 'wx' });
  return stored;
}

export async function readFile(stored) {
  return fs.readFile(safe(stored));
}

/** Erase files from disk permanently. Missing files are ignored. */
export async function eraseFiles(storedNames) {
  let n = 0;
  for (const s of storedNames) {
    try { await fs.unlink(safe(s)); n++; } catch (e) { if (e.code !== 'ENOENT') console.error('[tasks] erase', s, e.message); }
  }
  return n;
}

/** Erase the files of these tasks (call BEFORE deleting the task rows). */
export async function eraseFilesOfTasks(k, taskQuery) {
  const rows = await k('task_files').whereIn('task_id', taskQuery).select('stored');
  return eraseFiles(rows.map((r) => r.stored));
}

/** Everything in the folder (used by Settings › Clear data › Tasks). */
export async function eraseAllFiles() {
  let list = [];
  try { list = await fs.readdir(/* turbopackIgnore: true */ filesDir()); } catch { return 0; }
  return eraseFiles(list.filter((f) => /^[a-zA-Z0-9_-]{16,60}\.[a-z]{3,4}$/.test(f)));
}

export async function storeStatus() {
  try {
    await fs.mkdir(filesDir(), { recursive: true, mode: 0o700 });
    await fs.access(filesDir(), fs.constants.W_OK);
    return 'ok';
  } catch (e) { return `error (${e.code || e.message})`; }
}
