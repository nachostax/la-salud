// La Salud service worker — offline app shell + external image cache.
//
// Goal: workout + kitchen tabs (and their library data, since it's all
// bundled into these JS files, not fetched separately) must work with zero
// network. Firestore sync obviously can't happen offline — that's expected
// and fine, the app already has its own online/offline sync-status handling.
//
// Bump CACHE_VERSION any time you change one of the cached files below.
// This matches the existing "?v=20260710" cache-busting convention already
// used in index.html — just remember to bump both together.
const CACHE_VERSION = 'la-salud-shell-v8';

// Separate, version-independent cache for external image assets: TheMealDB
// recipe photos (Kitchen tab), plus the GitHub-hosted category/fingerprint
// images and YouTube exercise-demo thumbnails (Workout tab). Kept out of
// CACHE_VERSION so a normal app-shell deploy doesn't wipe hundreds of
// cached images and force them all to re-download — these are all
// effectively immutable (a given meal id / repo file / video id always
// points at the same image), so there's no cache-busting concern here the
// way there is for the app shell.
const IMAGE_CACHE = 'la-salud-external-images-v1';
const IMAGE_HOSTS = [
  'www.themealdb.com', 'themealdb.com',       // Kitchen: recipe photos
  'raw.githubusercontent.com',                // Workout: category pics + fingerprint icons
  'img.youtube.com'                           // Workout: exercise video thumbnails
];

// Digest-overlay gifs (Log tab "Ñam Ñam" / "¡Vamos Vamos!" covers) — warmed
// into IMAGE_CACHE at install time so the very first meal/workout log a
// person submits already has the gif ready instead of racing a fresh
// multi-hundred-KB download against the overlay's 3s minimum.
const DIGEST_GIFS = [
  'https://raw.githubusercontent.com/nachostax/la-salud2/main/EATINGGIF.gif',
  'https://raw.githubusercontent.com/nachostax/la-salud2/main/RUNNING.gif'
];

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
    Promise.all([
      caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL_FILES)),
      // Cross-origin fetches here come back opaque (status 0) since there's
      // no explicit CORS mode — that's fine, we can still cache and later
      // serve an opaque response for display purposes, we just can't inspect
      // it. Fetched with a plain fetch() (not tied to a real <img>), so
      // catch failures individually rather than letting one bad fetch sink
      // the whole install.
      caches.open(IMAGE_CACHE).then(cache => Promise.all(
        DIGEST_GIFS.map(url => fetch(url).then(res => cache.put(url, res)).catch(() => {}))
      ))
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // Clean up old shell versions, but never touch IMAGE_CACHE — it's
        // meant to persist across shell deploys.
        keys
          .filter(k => k !== CACHE_VERSION && k !== IMAGE_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // External image assets: cache-first. These are cross-origin, but
  // unlike Firestore/auth traffic they're static, publicly cacheable
  // assets — a recipe photo, a category picture, or a video thumbnail
  // is never going to change for a given id, so we never need to
  // re-check the network once it's cached. This is what makes the
  // Kitchen tab's meal cards and the Workout tab's category grid /
  // video thumbnails fast after the first load, instead of re-fetching
  // hundreds of images from themealdb.com / GitHub / YouTube every time.
  if (IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          // Cache real successes (res.ok) AND opaque cross-origin responses
          // (type 'opaque', status 0, ok:false — that's just what a no-cors
          // <img> fetch always looks like, not a failure signal). Genuine
          // network errors reject the fetch promise entirely and are caught
          // below, so nothing broken ends up cached here.
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(IMAGE_CACHE).then(cache => cache.put(event.request, copy));
          }
          return res;
        });
        // No offline fallback needed: if this fails offline, the <img>
        // just shows its normal broken-image state, same as it already
        // does today for anything not yet cached.
      })
    );
    return;
  }

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
