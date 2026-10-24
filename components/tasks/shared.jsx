'use client';
// Small pieces shared by the task board, task dialog and My tasks.
import { useEffect } from 'react';
import Icon from '@/components/Icon';
import Portal from '@/components/Portal';
import { api } from '@/components/client';

export const tasksApi = (action, data) => api('/api/tasks', { action, ...data });
export const STATUS = { todo: 'To do', doing: 'In progress', done: 'Done' };
export const PRIORITY = { high: 'High', normal: 'Normal', low: 'Low' };
export const LABEL_COLORS = ['#2fd486', '#ffc65c', '#5cb8ff', '#ff8fc7', '#b99bff', '#ff8a5c', '#7fe0e0', '#d0d6d2'];

// ---- time (shown in IST) ----
const IST = 5.5 * 3600e3;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ist = (d) => new Date(new Date(d).getTime() + IST);
const dayKey = (d) => ist(d).toISOString().slice(0, 10);
/** ISO -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in IST, for the inputs */
export const toInputs = (iso) => (iso ? { date: ist(iso).toISOString().slice(0, 10), time: ist(iso).toISOString().slice(11, 16) } : { date: '', time: '' });
export const fromInputs = (date, time) => (date ? `${date}T${time || '17:00'}` : '');
export const hrs = (iso) => { const t = ist(iso); return `${String(t.getUTCHours()).padStart(2, '0')}${String(t.getUTCMinutes()).padStart(2, '0')} hrs`; };
export const short = (iso) => { const t = ist(iso); return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}`; };
export const when = (iso) => (iso ? `${short(iso)} ${hrs(iso)}` : '');
export const longDue = (iso) => { const t = ist(iso); return `${DAY[t.getUTCDay()]} ${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${hrs(iso)}`; };

/** [class, text] for a due date chip */
export function dueChip(iso, done) {
  if (!iso) return null;
  if (done) return ['', when(iso)];
  const now = Date.now(); const d = new Date(iso).getTime();
  if (d < now) return ['over', `Overdue · ${when(iso)}`];
  const today = dayKey(now); const k = dayKey(iso);
  if (k === today) return ['soon', `Today ${hrs(iso)}`];
  if (k === dayKey(now + 86400e3)) return ['soon', `Tomorrow ${hrs(iso)}`];
  return ['', when(iso)];
}

export function Due({ iso, done, prefix = '', style }) {
  const c = dueChip(iso, done);
  if (!c) return null;
  return <span className={`tk-due ${c[0]}`} style={style}><Icon n="cal" size={14} />{prefix}{c[1]}</span>;
}

export function Avatar({ user, size = 28, title }) {
  if (!user) return <span className="tk-av" style={{ width: size, height: size, background: '#9aa69f', fontSize: size * 0.4 }}>?</span>;
  return <span className="tk-av" title={title || user.name} style={{ width: size, height: size, background: user.color, fontSize: size * 0.38 }}>{user.ini}</span>;
}

export const Label = ({ l, style }) => (l ? <span className="tk-lab" style={{ '--c': l.color, ...style }}>{l.name}</span> : null);

export function Modal({ children, onClose, width = 860, label }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <Portal>
      <div className="tk-modal" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div className="card3 stack" style={{ maxWidth: width }}>{children}</div>
      </div>
    </Portal>
  );
}

export const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Photos are made smaller in the browser before upload (max 2000 px, JPEG); PDFs go as they are. */
export async function shrink(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 1.5e6 && /jpeg/i.test(file.type)) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch { return file; }
}

export async function uploadFile(taskId, file) {
  const f = await shrink(file);
  if (f.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
  const fd = new FormData(); fd.append('taskId', String(taskId)); fd.append('file', f, f.name);
  const res = await fetch('/api/tasks/file', { method: 'POST', headers: { 'x-kl': '1' }, body: fd });
  let j = {}; try { j = await res.json(); } catch {}
  if (!res.ok) throw new Error(j.error || (res.status === 413 ? 'That file is too large.' : `Upload failed (${res.status})`));
  return j;
}
