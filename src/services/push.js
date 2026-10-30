/**
 * Push notifications (FCM) without Cloud Functions.
 *
 * - In the browser we register `public/firebase-messaging-sw.js` (generated at
 *   build time with the public Firebase config) and store the FCM token on the
 *   user's document.
 * - Sending is done by a Cloudflare Pages Function (functions/api/send-push.js)
 *   which holds the service-account secret. The app calls it after each owner
 *   action; if it is not deployed yet, everything keeps working with in-app
 *   notifications only.
 */
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, getMessagingSafe, VAPID_KEY } from './bootstrap';
import { COLLECTIONS } from '../utils/constants';

/**
 * Ask for notification permission, register the service worker and save the
 * FCM token on the user document. Returns the token or null (best effort).
 */
export async function registerPushToken(uid) {
  try {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return null;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    const messaging = await getMessagingSafe();
    if (!messaging) return null;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY || undefined,
      serviceWorkerRegistration: reg,
    });
    if (token && uid) {
      await updateDoc(doc(db, COLLECTIONS.USERS, uid), { fcmToken: token }).catch(() => {});
    }
    return token;
  } catch {
    return null;
  }
}

/** Handle a foreground FCM message (the Firestore listener is the primary path). */
export async function listenForegroundMessages(callback) {
  const messaging = await getMessagingSafe();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback?.(payload?.notification || {}, payload?.data || {});
  });
}

/**
 * Ask the Pages Function to deliver a push to one token.
 * Returns true when the push was accepted; false otherwise (never throws).
 */
export async function sendPushToToken(token, title, body, data = {}) {
  try {
    const user = auth?.currentUser;
    if (!user || !token) return false;
    const idToken = await user.getIdToken();
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, title, body, data }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
