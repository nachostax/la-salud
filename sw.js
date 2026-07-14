// La Salud service worker — offline app shell.
//
// Goal: workout + kitchen tabs (and their library data, since it's all
// bundled into these JS files, not fetched separately) must work with zero
// network. Firestore sync obviously can't happen offline — that's expected
// and fine, the app already has its own online/offline sync-status handling.
//
// Bump CACHE_VERSION any time you change one of the cached files below.
// This matches the existing "?v=20260710" cache-busting convention already
// used in index.html — just remember to bump both together.
const CACHE_VERSION = 'la-salud-shell-v4';

const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './ui.js',
  './kitchen-library.js',
  './kitchen.js',
  './workout-library.js',
  './workout.js',
  './log.js',
  './vitals.js',
  './progress.js',
  './settings.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never touch Firestore/Firebase/Google-font/other cross-origin traffic —
  // only handle same-origin app-shell requests. Everything else (Firestore
  // reads/writes, fonts, the icon-snippet fetch) falls through to the
  // network exactly as it does with no service worker at all.
  if (url.origin !== self.location.origin) return;

  // Network-first, falling back to cache when offline. This means: online,
  // you always get the latest deployed file (so the ?v= cache-busting still
  // works as before); offline, you get whatever was last cached.
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
