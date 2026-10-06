/* Generated after the Vite build. Do not edit dist/sw.js. */
const BUILD = __BUILD_CONFIG__;
const CACHE_NAME = BUILD.prefix + BUILD.version;
const ROOT_URL = new URL(BUILD.base, self.location.origin).href;
const STATIC_PATHS = new Set(BUILD.assets.map(path => BUILD.base + path));

self.addEventListener('install', event => {
  // A failed asset download must not install an incomplete offline version.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all(BUILD.assets.map(async path => {
        const request = new Request(new URL(BUILD.base + path, self.location.origin), { cache: 'reload', credentials: 'same-origin' });
        const response = await fetch(request);
        if (!response.ok || response.type === 'opaque' || response.redirected) throw new Error('Offline asset unavailable.');
        await cache.put(request, response);
      }));
      const shell = await cache.match(new URL(BUILD.base + 'index.html', self.location.origin).href);
      if (!shell) throw new Error('Offline shell unavailable.');
      await cache.put(ROOT_URL, shell.clone());
      // Intentionally no skipWaiting: the page asks the visitor before updating.
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the previous static version as well. Never touch another app's caches.
    const own = (await caches.keys()).filter(name => name.startsWith(BUILD.prefix));
    const previous = own.filter(name => name !== CACHE_NAME).at(-1);
    await Promise.all(own.filter(name => name !== CACHE_NAME && name !== previous).map(name => caches.delete(name)));
    await self.clients.claim();
    // No reload, post, background sync, API fetch or personal data cache here.
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ type: 'VERSION', version: BUILD.version, base: BUILD.base });
  }
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    // The UI sends this only after an explicit click and outside active form/save/export work.
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('authorization') || request.cache === 'no-store') return;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BUILD.base)) return;
  // Only exact, generated static URLs are handled. All API/unknown paths bypass this worker.
  const navigation = request.mode === 'navigate' && (url.pathname === BUILD.base || url.pathname === BUILD.base + 'index.html');
  if (!navigation && (url.search || !STATIC_PATHS.has(url.pathname))) return;
  const key = navigation ? ROOT_URL : new URL(url.pathname, self.location.origin).href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(key);
    // A cache miss is fetched but never added dynamically, preventing personalized cache entries.
    return saved || fetch(request);
  })());
});
