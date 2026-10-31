/**
 * Environment bootstrap for the emulator test process.
 *
 * MUST be imported before anything that touches `src/config/firebase.js`:
 * in ESM, imports evaluate in order, so every test module imports this file
 * first (see helpers.mjs).
 *
 * Values mimic a Vite build (in the browser `import.meta.env` is used instead
 * of `process.env` — src/config/firebase.js reads both).
 */
process.env.VITE_FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'demo-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN =
  process.env.VITE_FIREBASE_AUTH_DOMAIN || '127.0.0.1:9099';
process.env.VITE_FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-taliani-tests';
process.env.VITE_FIREBASE_STORAGE_BUCKET =
  process.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-taliani-tests.appspot.com';
process.env.VITE_FIREBASE_MESSAGING_SENDER_ID =
  process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0';
process.env.VITE_FIREBASE_APP_ID = process.env.VITE_FIREBASE_APP_ID || '1:0:web:demo';
process.env.VITE_OWNER_EMAIL =
  process.env.VITE_OWNER_EMAIL || 'app.taliani.coiffeur@gmail.com';

/** Emulator endpoints used by the connected SDK instances. */
export const FIRESTORE_EMULATOR = { host: '127.0.0.1', port: 8080 };
export const AUTH_EMULATOR = 'http://127.0.0.1:9099';
