/* Service worker template. `swPlugin.ts` replaces the two tokens below at build
   time and emits the result as dist/sw.js. Never edit dist/sw.js by hand.

   Scope: the app shell only. Game traffic (HTTP POST commands + the SSE
   projection stream under /rooms, plus /health and /dev) is never cached or
   intercepted - the server is authoritative and a stale snapshot is worse than
   none. Offline, the shell still opens and the app says it is offline. */

const VERSION = '__SW_VERSION__';
const PRECACHE_URLS = __SW_PRECACHE__;
const SHELL = '/index.html';
const PRECACHE = `md-precache-${VERSION}`;
const FONTS = 'md-fonts-v1';
const FONT_ENTRIES_MAX = 40;
const NAV_TIMEOUT_MS = 4000;

const NETWORK_ONLY_PREFIXES = ['/rooms', '/health', '/dev'];

self.addEventListener('install', (event) => {
  // No skipWaiting here: swapping the worker mid-game is the page's call, made
  // through the SKIP_WAITING message when the player taps "Reload".
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, FONTS]);
      for (const key of await caches.keys()) {
        if (key.startsWith('md-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.get('accept')?.includes('text/event-stream')) return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(navigate(request));
      return;
    }
    if (NETWORK_ONLY_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
      return;
    }
    event.respondWith(precachedFirst(request));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else cross-origin (Turnstile, ...) goes straight to the network.
});

// HTML: network first so a deploy is picked up on the next load; if the network
// is down or slow, fall back to the cached shell (every client route is the same
// SPA document).
async function navigate(request) {
  try {
    const response = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (response.ok) return response;
    return (await shell()) ?? response;
  } catch {
    const cached = await shell();
    if (cached) return cached;
    return new Response('Offline', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

function shell() {
  return caches.match(SHELL, { cacheName: PRECACHE, ignoreVary: true });
}

// Build output is content-hashed, so a precached hit is always current.
async function precachedFirst(request) {
  const hit = await caches.match(request, { cacheName: PRECACHE, ignoreVary: true });
  return hit ?? fetch(request);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        trim(cache);
      }
      return response;
    })
    .catch(() => undefined);
  if (hit) return hit;
  return (await refresh) ?? Response.error();
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - FONT_ENTRIES_MAX))) {
    await cache.delete(key);
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
