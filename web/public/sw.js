// Service worker: keeps the app itself available without signal and shows push reminders. API
// responses are never stored here; the app keeps its own saved copies and clears them on sign-out.
const CACHE = 'technicon-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(['/', '/manifest.webmanifest', '/icon-64.png', '/icon-192.png', '/logo.png']);
      // The first page load happens before this worker is in charge, so fetch what it needs now.
      const html = await (await fetch('/', { cache: 'no-cache' })).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll(assets);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // The newest page when there's signal, the saved one when there isn't.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put('/', response.clone());
          return response;
        } catch {
          return (await cache.match('/')) ?? Response.error();
        }
      })()
    );
    return;
  }

  // Built files have the version in their name, so a saved copy is always right.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })()
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Technicon Sales', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-64.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever a page of this app.
  const path = String(event.notification.data?.url || '/');
  const target = path.startsWith('/') && !path.startsWith('//') ? path : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          return client.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
