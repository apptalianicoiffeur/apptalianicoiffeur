/**
 * Push notifications (FCM) without Cloud Functions.
 *
 * - The browser registers `public/firebase-messaging-sw.js` and stores the
 *   user's FCM token on their Firestore profile.
 * - Cloudflare handlers deliver pushes without exposing service credentials or
 *   recipient registration tokens to the browser.
 */
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, getMessagingSafe, VAPID_KEY } from './bootstrap';
import { COLLECTIONS } from '../utils/constants';

/**
 * Register the service worker and save the FCM token. Permission prompts are
 * only requested from an explicit user action.
 */
export async function registerPushToken(
  uid,
  { requestPermission = false, existingToken = '' } = {}
) {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  let permission = Notification.permission;
  if (permission === 'default' && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return null;

  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  const messaging = await getMessagingSafe();
  if (!messaging) throw new Error('Firebase Messaging is not supported in this browser.');

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY || undefined,
    serviceWorkerRegistration: reg,
  });
  if (!token) throw new Error('Firebase Messaging did not return a registration token.');
  if (uid && token !== existingToken) {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { fcmToken: token });
  }
  return token;
}

/** Handle a foreground FCM message (the Firestore listener is the primary path). */
export async function listenForegroundMessages(callback) {
  const messaging = await getMessagingSafe();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback?.(payload?.notification || {}, payload?.data || {});
  });
}

async function postPush(path, body, includeCurrentUser = true) {
  try {
    const user = includeCurrentUser ? auth?.currentUser : null;
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

    const res = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error || '';
      } catch {
        // The endpoint may return a non-JSON error response.
      }
      console.error(`Push delivery failed with HTTP ${res.status}.`, detail);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Push delivery request failed.', err);
    return false;
  }
}

/** Ask the server to deliver a push to a token; the owner is authorized server-side. */
export function sendPushToToken(token, title, body, data = {}) {
  if (!auth?.currentUser || !token) return Promise.resolve(false);
  return postPush('/api/send-push', { token, title, body, data });
}

/** Ask the server to notify the owner about a recently created booking. */
export function sendNewBookingPush(bookingId) {
  return postPush('/api/booking-created', { bookingId });
}
