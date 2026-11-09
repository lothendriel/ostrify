const BUILD_ID = new URL(self.location.href).searchParams.get('build') ?? 'default';
const CACHE_NAME = `ostrify-app-${BUILD_ID}`;
const APP_SHELL = ['/', '/manifest.webmanifest', '/ostrify-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ostrify-app-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
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

  event.respondWith(
    fetch(request).then(async (response) => {
      if (response.ok && response.type === 'basic') {
        await caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return cached ?? Response.error();
    }),
  );
});
