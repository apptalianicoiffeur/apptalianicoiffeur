/**
 * Shared helpers for the Firestore emulator tests.
 *
 * The tests exercise the REAL service modules (src/services/*.js) against the
 * emulators started by `firebase emulators:exec` (see package.json scripts),
 * with the real `firestore.rules` loaded from firebase.json.
 *
 * Identity
 * --------
 * `firestore.rules` authorises on `request.auth.token.email` and
 * `request.auth.token.email_verified`. The Auth emulator only ever emits those
 * two claims FROM THE STORED USER RECORD: `generateJwt` writes
 * `email: user.email, email_verified: user.emailVerified` AFTER spreading any
 * custom claim, so custom claims can never supply them. A user must therefore
 * exist first.
 *
 * `provisionAccount(uid, email)` creates it through the privileged Admin REST
 * endpoint (`Authorization: Bearer owner`), which — unlike the public
 * `accounts:signUp` — accepts an exact `localId` and `emailVerified: true`.
 * `signInAs(...)` then signs in with `signInWithCustomToken` using a plain
 * JSON blob as the token (the emulator accepts a JSON payload and skips the
 * JWT `aud` assertion on that path).
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
import { AUTH_EMULATOR, FIRESTORE_EMULATOR, PROJECT_ID } from './env.mjs';

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

/** Emails must match the identity the rules expect (owner = rules constant). */
const EMAILS = new Map([
  [OWNER_UID, OWNER_EMAIL],
  [CLIENT_A_UID, 'client.a@example.com'],
  [CLIENT_B_UID, 'client.b@example.com'],
]);

const emailFor = (uid, claims = {}) =>
  String(claims.email || EMAILS.get(uid) || `${uid}@example.com`).trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Identity provisioning (privileged Auth Admin REST API)             */
/* ------------------------------------------------------------------ */

// The Auth emulator mounts the OpenAPI spec under the production host name
// (server.js `specForRouter()` rewrites `https://identitytoolkit.googleapis.com`
// to `/identitytoolkit.googleapis.com`), which is also what the SDK uses.
const AUTH_ADMIN = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
/** uid -> in-flight/completed provisioning promise (failures are NOT cached). */
const provisioned = new Map();

/** Best-effort extraction of the emulator's error text. */
function errorText(body, fallback) {
  const raw = body?.error?.message ?? body?.error ?? body?.message ?? fallback;
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

async function createAccount(uid, email) {
  const res = await fetch(`${AUTH_ADMIN}/accounts:signUp`, {
    method: 'POST',
    headers: {
      // Grants the privileged branch: allows `localId` + `emailVerified`.
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetProjectId: PROJECT_ID,
      localId: uid,
      email,
      emailVerified: true,
      // Never used: tests only ever sign in with a custom token.
      password: 'emulator-test-pw',
    }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }

  // Re-running the suite, or reusing an id, is not an error.
  const text = errorText(body, '');
  if (res.ok || text.includes('EMAIL_EXISTS') || text.includes('DUPLICATE_LOCAL_ID')) {
    return;
  }
  throw new Error(`provisionAccount(${uid}) failed: HTTP ${res.status} — ${text || 'no body'}`);
}

/**
 * Create the auth record backing `uid` with a verified `email`, so that the
 * ID token minted on sign-in carries it. Idempotent within a run; a failed
 * attempt is retried on the next call instead of being remembered.
 */
export function provisionAccount(uid, email = emailFor(uid)) {
  const pending = provisioned.get(uid);
  if (pending) return pending;

  const attempt = createAccount(uid, email).catch((err) => {
    provisioned.delete(uid);
    throw err;
  });
  provisioned.set(uid, attempt);
  return attempt;
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}

/**
 * Sign in (or sign out when uid is null) and wait for the auth state.
 * The token is a JSON payload: `{ uid, claims? }`.
 */
export async function signInAs(uid, claims = {}) {
  await signOut(auth).catch(() => {});
  if (uid) {
    await provisionAccount(uid, emailFor(uid, claims));
    const extra = { ...claims };
    delete extra.email;
    delete extra.email_verified;
    const token = Object.keys(extra).length ? { uid, claims: extra } : { uid };
    await signInWithCustomToken(auth, JSON.stringify(token));
  }
  await waitForAuth();

  // The rules key off `email` / `email_verified`, which the emulator only puts
  // in the token when the user record exists. Fail loudly here instead of
  // letting every later write come back as an opaque permission-denied.
  if (uid) {
    const { claims: got } = await auth.currentUser.getIdTokenResult();
    assert.ok(
      got.email && got.email_verified === true,
      `sign-in for ${uid} produced a token without email/email_verified: ` +
        `email=${JSON.stringify(got.email)} email_verified=${JSON.stringify(got.email_verified)}`
    );
  }
  return auth.currentUser;
}

/** The shop owner (matches `ownerEmail()` in firestore.rules). */
export function signInAsOwner() {
  return signInAs(OWNER_UID);
}

/** A regular verified client. */
export function signInAsClient(uid = CLIENT_A_UID, email = EMAILS.get(CLIENT_A_UID)) {
  return signInAs(uid, { email });
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
