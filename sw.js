// Service worker: makes the app open and work with no internet.
// Bump VERSION whenever app files change so devices pick up the update.
const VERSION = 'v42';
const CACHE = `shop-${VERSION}`;
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/brand.js',
  './js/install.js',
  './js/theme.js',
  './brand/book-icon.svg',
  './brand/symbol.svg',
  './brand/symbol-on-dark.svg',
  './brand/developers-logo.svg',
  './brand/developers-logo-on-dark.svg',
  './icons/book-apple-180.png',
  './js/store.js',
  './js/calc.js',
  './js/ui.js',
  './js/backend-local.js',
  './js/backend-firebase.js',
  './js/views/home.js',
  './js/views/sell.js',
  './js/views/stock.js',
  './js/views/orders.js',
  './js/views/doclayout.js',
  './js/views/changes.js',
  './js/views/dayclose.js',
  './js/views/staff.js',
  './js/views/backup.js',
  './js/views/pricing.js',
  './js/views/shiftgate.js',
  './js/i18n.js',
  './js/views/money.js',
  './js/views/settings.js',
  './js/views/manage.js',
  './js/views/customers.js',
  './js/views/quotes.js',
  './js/views/setup.js',
  './icons/book-192.png',
  './icons/book-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never mixes in old files.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shop-') && k !== CACHE && k !== 'shop-lib').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase library files: versioned and never change → cache forever.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.open('shop-lib').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // The Inter font from Google Fonts: keep a copy so the app looks the same offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('shop-lib').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; } catch { return Response.error(); }
    }));
    return;
  }

  if (url.origin !== location.origin) return; // Firestore/Auth traffic goes straight to the network

  // App files: answer from the cache at once (fast even on a weak connection),
  // and refresh the cache in the background so the next open gets updates.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
    const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (cached) { fresh.catch(() => {}); e.waitUntil(fresh.catch(() => {})); return cached; }
    try { return await fresh; } catch { return Response.error(); }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || '#/home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate?.(`./${link}`); return c.focus(); } }
    return self.clients.openWindow(`./${link}`);
  }));
});
