/**
 * Environment bootstrap for the emulator test process.
 *
 * MUST be imported before anything that touches `src/config/firebase.js`:
 * in ESM, imports evaluate in order, so every test module imports this file
 * first (see helpers.mjs).
 *
 * Values mimic a Vite build (in the browser `import.meta.env` is used instead
 * of `process.env` — src/config/firebase.js reads both).
 *
 * They are assigned UNCONDITIONALLY on purpose: the suites must talk to the
 * emulator project and to the owner identity hardcoded in `firestore.rules`,
 * never to whatever happens to sit in the developer shell or in `.env`.
 */
export const PROJECT_ID = 'demo-taliani-tests';

process.env.VITE_FIREBASE_API_KEY = 'demo-api-key';
// `@firebase/auth` asserts that `authDomain` contains no ':' (it is only used
// for redirects/OAuth; the emulator URL is passed to connectAuthEmulator).
process.env.VITE_FIREBASE_AUTH_DOMAIN = `${PROJECT_ID}.firebaseapp.com`;
process.env.VITE_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.VITE_FIREBASE_STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
process.env.VITE_FIREBASE_MESSAGING_SENDER_ID = '0';
process.env.VITE_FIREBASE_APP_ID = '1:0:web:demo';
// Must equal `ownerEmail()` in firestore.rules.
process.env.VITE_OWNER_EMAIL = 'app.taliani.coiffeur@gmail.com';
// Never let a VAPID key from `.env` leak into the test process.
process.env.VITE_FIREBASE_VAPID_KEY = '';

/** Emulator endpoints used by the connected SDK instances. */
export const FIRESTORE_EMULATOR = { host: '127.0.0.1', port: 8080 };
export const AUTH_EMULATOR = 'http://127.0.0.1:9099';
