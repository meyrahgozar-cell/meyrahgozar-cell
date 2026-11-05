/* Reel service worker — app shell offline support.
   Never caches API or storage traffic: only the interface itself. */

const VERSION = 'reel-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './css/ai.css',
  './css/rtl.css',
  './fonts/Vazirmatn-arabic.woff2',
  './fonts/Vazirmatn-latin.woff2',
  './js/app.js',
  './js/config.js',
  './js/state.js',
  './js/lib/supabase.js',
  './js/lib/dom.js',
  './js/lib/format.js',
  './js/lib/jalali.js',
  './js/lib/store.js',
  './js/lib/router.js',
  './js/lib/ui.js',
  './js/lib/images.js',
  './js/lib/charts.js',
  './js/lib/richtext.js',
  './js/services/client.js',
  './js/services/auth.js',
  './js/services/db.js',
  './js/services/localdb.js',
  './js/services/ai.js',
  './js/ui/parts.js',
  './js/ui/palette.js',
  './js/ui/lightbox.js',
  './js/views/auth.js',
  './js/views/home.js',
  './js/views/timeline.js',
  './js/views/gallery.js',
  './js/views/calendar.js',
  './js/views/insights.js',
  './js/views/threads.js',
  './js/views/places.js',
  './js/views/settings.js',
  './js/views/editor.js',
  './js/views/frame.js',
  './js/views/setup.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Leave Supabase (auth, REST, storage) entirely alone.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Static assets: network first so updates always land, cache for offline.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch {
      const cached = await cache.match(request);
      return cached || new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
