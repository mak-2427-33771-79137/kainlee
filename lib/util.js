import crypto from 'crypto';

export const REGIMENT_DEFAULT = 'Kainlee';

export * from './consts';

const ALPHA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomString(n) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s;
}
export const newToken = () => randomString(22);
export const newCheckinCode = () => randomString(12).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
export const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

// Normalise an Indian/international mobile number to digits with country code.
export function normalizeMobile(raw) {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}
export function prettyMobile(d) {
  if (!d) return '';
  if (d.startsWith('91') && d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return '+' + d;
}

// Names must be in English letters so gate search and PDFs work for everyone.
export function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}
export function isLatinName(s) {
  return /^[A-Za-z][A-Za-z .,'()\-/&]*$/.test(s);
}

// ---- Time (all stored in UTC, shown in IST) ----
const TZ = 'Asia/Kolkata';
function parts(d) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date(d));
  const o = {}; for (const x of p) o[x.type] = x.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}
export function fmtDate(d) { if (!d) return ''; const o = parts(d); return `${o.day} ${o.month} ${o.year}`; }
export function fmtHrs(d) { if (!d) return ''; const o = parts(d); return `${o.hour}${o.minute} hrs`; }
export function fmtDateHrs(d) { if (!d) return ''; return `${fmtDate(d)} at ${fmtHrs(d)}`; }
export function fmtStamp(d = new Date()) { const o = parts(d); return `${o.day} ${o.month} ${o.year}, ${o.hour}${o.minute} hrs IST`; }
export function fmtShort(d) { if (!d) return ''; const o = parts(d); return `${o.day} ${o.month}, ${o.hour}:${o.minute}`; }
// "2026-10-21T20:00" (as typed in IST) -> Date
export function istInputToDate(v) {
  if (!v) return null;
  const s = String(v).length === 16 ? v + ':00' : v;
  const d = new Date(s + '+05:30');
  return isNaN(d) ? null : d;
}
// Date -> "2026-10-21T20:00" in IST for <input type=datetime-local>
export function dateToIstInput(d) {
  if (!d) return '';
  const t = new Date(new Date(d).getTime() + 5.5 * 3600e3);
  return t.toISOString().slice(0, 16);
}

export function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (!req) return '';
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function jsonSafe(o) { return JSON.parse(JSON.stringify(o)); }

export function parseJSON(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
