/* eslint-disable */
/**
 * Taliani Coiffeur - service worker (TEMPLATE).
 *
 * `scripts/generate-sw.js` copies this file to `public/firebase-messaging-sw.js`
 * and injects the public Firebase config at build
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
  const title = (payload && payload.notification && payload.notification.title) || 'طالياني كوافير';
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const bookingId = event.notification?.data?.bookingId;
  const notificationId = event.notification?.data?.notificationId;
  const target = new URL('/notification', self.location.origin);
  if (bookingId && /^[A-Za-z0-9_-]{1,60}$/.test(bookingId)) {
    target.searchParams.set('bookingId', bookingId);
  }
  if (notificationId && /^[A-Za-z0-9_-]{1,60}$/.test(notificationId)) {
    target.searchParams.set('notificationId', notificationId);
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const appClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (appClient) {
        await appClient.navigate(target.href);
        await appClient.focus();
        return;
      }
      await self.clients.openWindow(target.href);
    })
  );
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
