/* Kainlee service worker: fast repeat visits, offline entry pass, push notifications. */
const VERSION = 'kl-v3';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

// Shown when a page was never opened on this device and there is no connection
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Offline · Kainlee</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font:16px/1.45 -apple-system,system-ui,sans-serif;color:#f4f1e8;
background:radial-gradient(120% 55% at 50% 0%,#14774a,#0a4a2c 42%,#04281a 75%,#021810);border:8px solid #FF2828;outline:8px solid #00572D;outline-offset:-16px}
main{max-width:360px;text-align:center}h1{font:700 28px Georgia,serif;margin:12px 0}p{color:#b7c9bd}
button{font:700 16px system-ui;color:#fff;border:0;border-radius:12px;padding:13px 24px;background:linear-gradient(135deg,#ff9a5c,#FF2828 45%,#c3101a)}</style></head>
<body><main><img src="/api/logo/192" width="96" height="96" alt=""><h1>You are offline</h1><p>This page has not been opened on this device yet. Pages you have opened before, and Gate check-in, keep working without a connection.</p><button onclick="history.back()">Go back</button> <button onclick="location.reload()">Try again</button></main></body></html>`;

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

// Logging out removes saved admin pages from this device
self.addEventListener('message', (e) => {
  if (e.data === 'kl-clear-pages') e.waitUntil(caches.delete(PAGES));
  // save the main pages ahead of time, so they open offline even if not visited yet
  if (e.data && e.data.type === 'kl-warm' && Array.isArray(e.data.urls)) {
    e.waitUntil((async () => {
      const cache = await caches.open(PAGES);
      for (const u of e.data.urls.slice(0, 20)) {
        try {
          const url = new URL(u, location.origin);
          if (url.origin !== location.origin || !isPage(url)) continue;
          const res = await fetch(url.pathname + url.search, { credentials: 'include' });
          if (res.ok && res.type === 'basic' && !res.redirected) await cache.put(url.pathname + url.search, res);
        } catch {}
      }
    })());
  }
});

const isPage = (url) => url.pathname.startsWith('/admin') || url.pathname.startsWith('/i/');

async function networkFirst(req, cacheKey) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(cacheKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey || req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // immutable build assets, fonts, crest: cache first
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
  if (!isPage(url)) return;

  // in-app navigation data (React Server Components): network first, then the last copy
  if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    const key = new URL(url); key.searchParams.delete('_rsc');
    const k = new Request(`${key.pathname}${key.search}${key.search ? '&' : '?'}__rsc=1`);
    e.respondWith(networkFirst(req, k).catch(() => Response.error()));
    return;
  }

  // full page loads: network first, fall back to the last copy, then the offline page
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, new Request(url.pathname + url.search)).catch(async () => {
      const cache = await caches.open(PAGES);
      return (await cache.match(url.pathname)) || new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }));
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
