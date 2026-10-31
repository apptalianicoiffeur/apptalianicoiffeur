/**
 * Shared helpers for the Firestore emulator tests.
 *
 * The tests exercise the REAL service modules (src/services/*.js) against the
 * emulators started by `firebase emulators:exec` (see package.json scripts),
 * with the real `firestore.rules` loaded from firebase.json.
 *
 * Identity: the Firestore emulator forwards the ID token minted by the Auth
 * emulator, so `signInAs(...)` mints a custom token (unsigned, the emulator
 * does not verify signatures) carrying the claims the rules inspect
 * (`email`, `email_verified`).
 *
 * The app has a single auth/firestore singleton, so the tests switch identity
 * sequentially with signInAsOwner / signInAsClient / signInAsAnonymous.
 */
import './env.mjs';
import assert from 'node:assert/strict';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { connectAuthEmulator, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';

import { auth, db, OWNER_EMAIL } from '../../src/config/firebase.js';
import { AUTH_EMULATOR, FIRESTORE_EMULATOR } from './env.mjs';

/* Connect the singleton SDK instances to the emulators (before any call). */
connectFirestoreEmulator(db, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });

export { auth, db, OWNER_EMAIL };

/** Fixed identities used across the suites. */
export const OWNER_UID = 'owner-uid-001';
export const CLIENT_A_UID = 'client-a-uid-001';
export const CLIENT_B_UID = 'client-b-uid-001';
export const SERVICE_ID = 'svc-haircut';
export const OTHER_SERVICE_ID = 'svc-beard';

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Unsigned JWT understood by the Auth emulator (no signature verification). */
function mintCustomToken(uid, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'none', typ: 'JWT' }),
    b64url({ sub: uid, uid, iat: now, exp: now + 3600, ...claims }),
    '',
  ].join('.');
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}

/** Sign in (or sign out when uid is null) and wait for the auth state. */
export async function signInAs(uid, claims = {}) {
  await signOut(auth).catch(() => {});
  if (uid) await signInWithCustomToken(auth, mintCustomToken(uid, claims));
  await waitForAuth();
  return auth.currentUser;
}

/** The shop owner (matches `ownerEmail()` in firestore.rules). */
export function signInAsOwner() {
  return signInAs(OWNER_UID, { email: OWNER_EMAIL, email_verified: true });
}

/** A regular verified client. */
export function signInAsClient(uid = CLIENT_A_UID, email = 'client.a@example.com') {
  return signInAs(uid, { email, email_verified: true });
}

/** No session at all (guest booking flows). */
export function signInAsAnonymous() {
  return signInAs(null);
}

/* ------------------------------------------------------------------ */
/* Assertion helpers                                                   */
/* ------------------------------------------------------------------ */

/** Assert that a promise rejects with a Firestore `permission-denied`. */
export async function expectDenied(promise, message = 'expected permission-denied') {
  let error = null;
  let rejected = false;
  try {
    await promise;
  } catch (err) {
    rejected = true;
    error = err;
  }
  assert.ok(rejected, `${message} — the operation unexpectedly succeeded`);
  const code = error?.code || '';
  const ok =
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    String(error?.message || '').includes('Missing or insufficient permissions');
  assert.ok(ok, `${message} — got: ${code} ${error?.message}`);
}

/* ------------------------------------------------------------------ */
/* Seeding (always as the owner: the only role allowed to write them)  */
/* ------------------------------------------------------------------ */

/** Create/replace the two services used by the booking payloads. */
export async function seedServices() {
  await signInAsOwner();
  await setDoc(doc(db, 'services', SERVICE_ID), {
    name: 'قص شعر',
    price: 1000,
    estimatedMinutes: 30,
    active: true,
    image: '',
  });
  await setDoc(doc(db, 'services', OTHER_SERVICE_ID), {
    name: 'حلاقة ذقن',
    price: 400,
    estimatedMinutes: 20,
    active: true,
    image: '',
  });
}

/** Publish the owner uid (required by the client -> owner notification rule). */
export async function seedPublicSettings(extra = {}) {
  await signInAsOwner();
  await setDoc(
    doc(db, 'settings', 'public'),
    {
      shopOpen: true,
      shopName: 'تالياني كوفير',
      ownerUid: OWNER_UID,
      slotInterval: 30,
      ...extra,
    },
    { merge: true }
  );
}

/* ------------------------------------------------------------------ */
/* Payload builders                                                    */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const addMin = (time, minutes) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};

/** A fully valid booking payload (see README data model). */
export function bookingPayload({
  date,
  time,
  duration = 30,
  userId = null,
  serviceId = SERVICE_ID,
  serviceName = 'قص شعر',
  price = 1000,
  status = 'pending',
  source = 'online',
  name = 'زبون تجريبي',
  phone = '+213551234567',
  notes = '',
} = {}) {
  return {
    userId,
    name,
    phone,
    serviceId,
    serviceName,
    price,
    durationMinutes: duration,
    date,
    scheduledStart: time,
    scheduledEnd: addMin(time, duration),
    expectedStart: time,
    expectedEnd: addMin(time, duration),
    actualStart: null,
    actualEnd: null,
    status,
    proposedDate: null,
    proposedTime: null,
    clientProposedDate: null,
    clientProposedTime: null,
    barberMessage: '',
    notes,
    source,
  };
}

/* ------------------------------------------------------------------ */
/* Document helpers                                                    */
/* ------------------------------------------------------------------ */

export const readDoc = (collectionName, id) => getDoc(doc(db, collectionName, id));
export const readQueue = (date) => readDoc('dailyQueue', date);
export const readBooking = (id) => readDoc('bookings', id);

/** Write several documents in ONE atomic request (rules see getAfter). */
export async function atomicWrite(docs) {
  const batch = writeBatch(db);
  for (const { path, id, data } of docs) batch.set(doc(db, path, id), data);
  await batch.commit();
}

/** All documents of a collection (current session permissions apply). */
export async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ------------------------------------------------------------------ */
/* Legacy seeding (Array shape) — owner only, used by the migration    */
/* ------------------------------------------------------------------ */

/** Write a `dailyQueue/{date}` document in the LEGACY Array shape. */
export async function seedLegacyQueue(date, entries) {
  await signInAsOwner();
  await setDoc(doc(db, 'dailyQueue', date), {
    date,
    entries,
    updatedAt: serverTimestamp(),
  });
}
