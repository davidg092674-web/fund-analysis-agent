// Only the public offline fallback is cached. Never cache authenticated pages,
// API responses, reports, holdings, login redirects, or other account data.
const CACHE = 'fundlens-offline-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add('/offline.html'))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || e.request.mode !== 'navigate' || /signin-with-chatgpt|signout-with-chatgpt|callback/.test(u.pathname)) return;
  e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
});
