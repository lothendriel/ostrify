const BUILD_ID = `${new URL(self.location.href).searchParams.get('build') ?? 'default'}-optimized-image-assets-v1`;
const CACHE_NAME = `ostrify-app-${BUILD_ID}`;
const APP_SHELL = ['/', '/manifest.webmanifest', '/ostrify-icon-192.png?v=opt-1', '/ostrify-logo-512.webp?v=opt-1', '/favicon.svg', '/pwa-192.svg', '/pwa-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const appCaches = keys.filter((key) => key.startsWith('ostrify-app-'));
        // Keep recent build caches available to older tabs requesting lazy chunks.
        const obsolete = appCaches.slice(0, Math.max(0, appCaches.length - 3)).filter((key) => key !== CACHE_NAME);
        return Promise.all(obsolete.map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) ?? Response.error()));
    return;
  }

  if (!/\.(?:js|css|svg|png|webp|woff2?)$/i.test(url.pathname)) return;

  const isFingerprintAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/i.test(url.pathname.split('/').pop() ?? '');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    // Content-hashed JS/CSS URLs are immutable; prefer the cached bytes on repeat visits.
    if (isFingerprintAsset && cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return cached ?? Response.error();
    }
  })());
});
