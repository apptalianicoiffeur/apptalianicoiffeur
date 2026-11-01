/**
 * Firebase initialization.
 * All values come from Vite environment variables (see .env.example).
 *
 * `import.meta.env` only exists inside Vite; in Node (Firebase emulator
 * tests, migration scripts) the same `VITE_*` variables are read from
 * `process.env` so the real service modules can be exercised as-is.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';

const env =
  (typeof import.meta !== 'undefined' && import.meta.env) ||
  (typeof process !== 'undefined' && process.env) ||
  {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** True when the Firebase web config has been provided in the environment. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

/** The only Google account allowed to manage the shop (barber). */
export const OWNER_EMAIL = (env.VITE_OWNER_EMAIL || '').trim().toLowerCase();

/** Web Push certificate key (VAPID) used by Firebase Cloud Messaging. */
export const VAPID_KEY = env.VITE_FIREBASE_VAPID_KEY || '';

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, auth, db };

/** Google auth provider (with the user's profile info). */
export const googleProvider = new GoogleAuthProvider();

/**
 * Firebase messaging is only available in supported browsers over HTTPS/localhost.
 * Returns null when unavailable so callers can degrade gracefully.
 */
export async function getMessagingSafe() {
  try {
    if (app && (await isSupported())) return getMessaging(app);
  } catch {
    /* ignore - messaging unsupported */
  }
  return null;
}
