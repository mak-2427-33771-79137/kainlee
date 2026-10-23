'use client';
// Small client helpers: API calls, toasts, file download.

export async function api(url, data, opts = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kl': '1' },
    body: JSON.stringify(data || {}),
    ...opts,
  });
  let json = {};
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(json.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return json;
}
export const admin = (action, data) => api('/api/admin', { action, ...data });

export function toast(msg, bad = false) {
  if (typeof document === 'undefined') return;
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast${bad ? ' bad' : ''}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), bad ? 5000 : 2800);
}

export function confetti() {
  if (typeof document === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#00572D', '#FF2828', '#14a35f', '#ffffff', '#ff7070'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${2 + Math.random() * 1.4}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

function fileNameFrom(res, url) {
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  return decodeURIComponent((m && m[1]) || url.split('/').pop().split('?')[0] || 'Kainlee-file');
}

/**
 * Download a file (report, backup, template). Fetches it first so a server error shows as a
 * message instead of a blank page. In the iPhone app the file goes to the share sheet
 * (Save to Files, WhatsApp, Mail); in a browser it is saved like any download.
 */
export async function downloadFile(url) {
  let res;
  try { res = await fetch(url, { credentials: 'include', cache: 'no-store' }); }
  catch { throw new Error('No connection. Connect to the internet and try again.'); }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error; } catch {}
    throw new Error(msg || (res.status === 401 ? 'Please log in again.' : `Could not prepare the file (${res.status}).`));
  }
  const name = fileNameFrom(res, url);
  const blob = await res.blob();
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    const n = await import('./native');
    try { await n.nativeShareBlob(blob, name); return; }
    catch (e) { if (/cancel/i.test(String(e?.message || e))) return; throw new Error(`Could not open the share sheet: ${e?.message || e}`); }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export function download(url) {
  downloadFile(url).catch((e) => toast(e.message || 'Could not download the file.', true));
}

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
