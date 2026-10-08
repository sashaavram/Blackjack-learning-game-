// Offline support: cache the app shell, serve from cache, refresh in the background.
const CACHE = 'bj-trainer-v6';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/anim.js', 'js/app.js', 'js/cards.js', 'js/drill.js', 'js/explain.js', 'js/game.js', 'js/rules-guide.js', 'js/store.js', 'js/strategy.js', 'js/strategy-data.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    }),
  );
});
