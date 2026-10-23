'use client';
// Offline support.
// - Gate check-in: keeps a copy of the event's guest list on the device; when there is no
//   connection, lookups, search and marking work from that copy and marks are queued.
// - The queue is sent automatically as soon as the device is online again (newest mark wins).
// - Guest RSVPs saved without a connection are queued and sent later too.
import { admin, api } from './client';

// ---------- tiny IndexedDB key/value store (falls back to memory) ----------
const mem = new Map();
let dbp;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open('kainlee-offline', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
export async function kvGet(key) {
  const d = await idb();
  if (!d) return mem.get(key);
  return new Promise((res) => { try { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); } catch { res(mem.get(key)); } });
}
export async function kvSet(key, val) {
  mem.set(key, val);
  const d = await idb();
  if (!d) return;
  await new Promise((res) => { try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = res; t.onerror = res; } catch { res(); } });
}

// ---------- connection state ----------
const listeners = new Set();
let state = { online: typeof navigator === 'undefined' ? true : navigator.onLine !== false, pending: 0, syncing: false, lastSync: 0 };
function emit(patch) { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); }
export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export const isNetworkError = (e) => !e?.status; // HTTP errors carry a status; failed fetches do not

// ---------- check-in ----------
const snapKey = (ev) => `snap:${ev}`;
const OUTBOX = 'outbox:checkin';

export async function refreshSnapshot(eventId) {
  try {
    const s = await admin('checkin.snapshot', { event_id: eventId });
    // keep offline marks that are not yet synced on top of the fresh copy
    for (const x of (await kvGet(OUTBOX)) || []) applyLocal(s, x);
    await kvSet(snapKey(eventId), s);
    return s;
  } catch { return null; }
}

function applyLocal(snap, x) {
  for (const p of snap.parties) for (const m of p.members) if (m.id === x.member_id) {
    m.fn[x.function_id] = { ...(m.fn[x.function_id] || { attending: false }), attendance: x.status, at: x.at };
    return p;
  }
  return null;
}

function partyOut(p) {
  return { id: p.id, name: p.name, category: p.category, city: p.city, rsvp: p.rsvp, offline: true,
    members: p.members.map((m) => ({ ...m, fn: Object.fromEntries(Object.entries(m.fn).map(([f, v]) => [f, { attending: v.attending, attendance: v.attendance }])) })) };
}

async function offlineCheckin(action, data, eventId) {
  const snap = await kvGet(snapKey(eventId));
  if (!snap) { const e = new Error('No connection, and this event’s guest list is not saved on this device yet. Open Check-in once while online.'); e.status = 0; throw e; }
  if (action === 'checkin.lookup') {
    const code = String(data.code || '').replace(/^KLN-/i, '').trim().toUpperCase();
    const p = snap.parties.find((x) => x.code === code);
    if (!p) { const e = new Error('This QR is not for this event, or is not valid.'); e.status = 404; throw e; }
    return { id: p.id };
  }
  if (action === 'checkin.search') {
    const words = String(data.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return { results: [] };
    return { results: snap.parties.filter((p) => words.every((w) => p.search.includes(w))).slice(0, 25).map((p) => ({ id: p.id, name: p.name, category: p.category, city: p.city, rsvp: p.rsvp })) };
  }
  if (action === 'checkin.party') {
    const p = snap.parties.find((x) => x.id === data.id);
    if (!p) { const e = new Error('Guest not found on this device.'); e.status = 404; throw e; }
    return partyOut(p);
  }
  if (action === 'checkin.stats') {
    let expected = 0, present = 0;
    for (const p of snap.parties) for (const m of p.members) {
      const v = m.fn[data.function_id];
      if (v?.attending && !m.is_walkin) expected++;
      if (v?.attendance === 'present') present++;
    }
    return { expected, present };
  }
  if (action === 'checkin.mark') {
    const x = { member_id: data.member_id, function_id: data.function_id, status: data.status || null, at: Date.now() };
    applyLocal(snap, x);
    await kvSet(snapKey(eventId), snap);
    const box = (await kvGet(OUTBOX)) || [];
    box.push(x);
    await kvSet(OUTBOX, box);
    emit({ pending: box.length });
    return { ok: true, offline: true };
  }
  const e = new Error('Walk-ins need a connection. Note the name and add them when back online.'); e.status = 0; throw e;
}

/** Check-in API that keeps working without a connection. */
export async function checkinCall(action, data, eventId) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { emit({ online: false }); return offlineCheckin(action, data, eventId); }
  try {
    const r = await admin(action, data);
    if (!state.online) emit({ online: true });
    if (action === 'checkin.mark') { // keep the device copy current
      const snap = await kvGet(snapKey(eventId));
      if (snap) { applyLocal(snap, { ...data, at: Date.now() }); kvSet(snapKey(eventId), snap); }
    }
    return r;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    emit({ online: false });
    return offlineCheckin(action, data, eventId);
  }
}

let syncing = null;
/** Send queued marks (and guest RSVPs). Safe to call often. */
export async function syncNow() {
  if (syncing) return syncing;
  syncing = (async () => {
    const box = (await kvGet(OUTBOX)) || [];
    emit({ pending: box.length });
    if (!box.length) return { applied: 0 };
    emit({ syncing: true });
    try {
      const r = await admin('checkin.sync', { marks: box });
      // remove only what we sent (new marks may have been added meanwhile)
      const now = (await kvGet(OUTBOX)) || [];
      const left = now.slice(box.length);
      await kvSet(OUTBOX, left);
      emit({ pending: left.length, online: true, lastSync: Date.now() });
      return r;
    } catch (e) {
      if (isNetworkError(e)) emit({ online: false });
      return { error: e.message };
    } finally { emit({ syncing: false }); }
  })();
  try { return await syncing; } finally { syncing = null; }
}

// ---------- guest RSVP saved offline ----------
const rsvpKey = (token) => `rsvp:${token}`;
export async function queueRsvp(token, payload) { await kvSet(rsvpKey(token), { payload, at: Date.now() }); }
export async function flushRsvp(token) {
  const q = await kvGet(rsvpKey(token));
  if (!q) return null;
  const r = await api(`/api/g/${token}`, q.payload);
  await kvSet(rsvpKey(token), null);
  return r;
}
export async function hasQueuedRsvp(token) { return !!(await kvGet(rsvpKey(token))); }

// ---------- automatic sync when the connection returns ----------
if (typeof window !== 'undefined' && !window.__klOfflineInit) {
  window.__klOfflineInit = true;
  window.addEventListener('online', () => { emit({ online: true }); syncNow(); });
  window.addEventListener('offline', () => emit({ online: false }));
  setInterval(() => { if (navigator.onLine !== false) syncNow(); }, 30000);
  kvGet(OUTBOX).then((b) => { emit({ pending: (b || []).length }); if ((b || []).length && navigator.onLine !== false) syncNow(); });
}
