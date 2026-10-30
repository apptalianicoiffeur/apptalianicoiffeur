/* eslint-disable */
/**
 * Taliani Coiffeur - service worker (TEMPLATE).
 *
 * `scripts/generate-sw.js` copies this file to `public/firebase-messaging-sw.js`
 * and replaces __FIREBASE_CONFIG__ with the public Firebase config at build
 * time (service workers cannot access Vite env variables at runtime).
 *
 * Responsibilities:
 *  1. Firebase Cloud Messaging: display background push notifications.
 *  2. A tiny network-first cache so the app shell works offline.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// PUBLIC Firebase web config (safe to expose in the browser).
firebase.initializeApp(__FIREBASE_CONFIG__);

const messaging = firebase.messaging();

/** Show background messages as browser notifications (Arabic, RTL). */
messaging.onBackgroundMessage((payload) => {
  const title = (payload && payload.notification && payload.notification.title) || 'تالياني كوفير';
  const body = (payload && payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    dir: 'rtl',
    lang: 'ar',
    tag: (payload && payload.data && payload.data.bookingId) || 'taliani',
    data: (payload && payload.data) || {},
  });
});

/* ------------------------- Minimal offline cache ------------------------- */
const CACHE_NAME = 'taliani-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin GET requests (never cache Firestore/API traffic).
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('/index.html'))
      )
  );
});
