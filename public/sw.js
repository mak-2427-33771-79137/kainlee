/* Kainlee service worker: fast repeat visits, offline entry pass, push notifications. */
const VERSION = 'kl-v2';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(['/api/logo/192', '/api/logo/512', '/fonts/grenze-gotisch-latin-700-normal.woff2', '/fonts/mukta-latin-400-normal.woff2']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // immutable build assets and fonts: cache first
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/api/logo/')) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // guest pages: network first, fall back to the last copy (so the entry QR works offline at the gate)
  if (req.mode === 'navigate' && url.pathname.startsWith('/i/')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(PAGES)).put(req, res.clone());
        return res;
      } catch {
        const hit = await (await caches.open(PAGES)).match(req);
        return hit || new Response('<h1 style="font-family:sans-serif">You are offline</h1><p>Open this page once while online to keep your entry pass available.</p>', { headers: { 'content-type': 'text/html' } });
      }
    })());
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Kainlee', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kainlee', {
    body: d.body || '',
    icon: '/api/logo/192',
    badge: '/api/logo/192',
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || '/admin' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) return c.navigate(url); return; }
    }
    return self.clients.openWindow(url);
  })());
});
