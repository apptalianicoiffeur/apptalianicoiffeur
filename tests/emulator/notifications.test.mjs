/**
 * Notification rules: a client may only notify the shop owner, and only about
 * a booking they actually own; the target user can only flip the `read` flag.
 *
 * These are the rules that replace the previous "any signed-in user may create
 * any notification for anyone" behaviour.
 *
 * Import order matters: helpers.mjs sets the env before src/config/firebase.js
 * is evaluated, so it is always imported first.
 */
import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';

import {
  CLIENT_A_UID,
  CLIENT_B_UID,
  OWNER_UID,
  bookingPayload,
  db,
  expectDenied,
  readCollection,
  seedPublicSettings,
  seedServices,
  signInAs,
  signInAsAnonymous,
  signInAsClient,
  signInAsOwner,
} from './helpers.mjs';
import { createBookingWithCheck } from '../../src/services/bookings.js';
import { createNotification, markRead } from '../../src/services/notifications.js';
import { ownerAccept } from '../../src/services/bookingActions.js';

const DAY = '2026-12-25';

test('setup: seed services and public settings', async () => {
  await seedServices();
  await seedPublicSettings();
  assert.equal(typeof OWNER_UID, 'string');
});

const emailOf = (uid) => `${uid}@example.com`;

async function asClient(uid) {
  await signInAs(uid, { email: emailOf(uid), email_verified: true });
}

async function bookingFor(uid, time) {
  await asClient(uid);
  return createBookingWithCheck(
    bookingPayload({ date: DAY, time, userId: uid, name: `زبون ${uid}` })
  );
}

/* ------------------------------------------------------------------ */
/* Who may create a notification, and for whom                         */
/* ------------------------------------------------------------------ */

test('a client CAN notify the owner about a booking they own', async () => {
  const id = await bookingFor(CLIENT_A_UID, '10:00');
  await asClient(CLIENT_A_UID);

  const notificationId = await createNotification({
    userId: OWNER_UID,
    bookingId: id,
    title: 'إلغاء موعد',
    body: 'قام الزبون بإلغاء الموعد',
  });
  assert.ok(notificationId, 'the notification must be created');

  await signInAsOwner();
  const created = (await readCollection('notifications')).find((n) => n.id === notificationId);
  assert.ok(created, 'the owner can read their notification');
  assert.equal(created.userId, OWNER_UID);
  assert.equal(created.bookingId, id);
  assert.equal(created.read, false);
});

test('a client CANNOT notify another client', async () => {
  const id = await bookingFor(CLIENT_A_UID, '10:30');
  await asClient(CLIENT_A_UID);

  await expectDenied(
    createNotification({ userId: CLIENT_B_UID, bookingId: id, title: 'إشعار', body: '...' }),
    'clients must not target other clients'
  );
});

test('a client CANNOT notify themselves pretending to be the owner', async () => {
  const id = await bookingFor(CLIENT_A_UID, '11:00');
  await asClient(CLIENT_A_UID);

  await expectDenied(
    createNotification({ userId: CLIENT_A_UID, bookingId: id, title: 'إشعار', body: '...' }),
    'the target must be the published owner uid'
  );
});

test('a client CANNOT notify the owner about someone else’s booking', async () => {
  const foreignId = await bookingFor(CLIENT_B_UID, '11:30');
  await asClient(CLIENT_A_UID);

  await expectDenied(
    createNotification({
      userId: OWNER_UID,
      bookingId: foreignId, // belongs to CLIENT_B
      title: 'إشعار كاذب',
      body: '...',
    }),
    'the booking must belong to the sender'
  );
});

test('a client CANNOT notify the owner with a fabricated booking id', async () => {
  await asClient(CLIENT_A_UID);

  await expectDenied(
    createNotification({
      userId: OWNER_UID,
      bookingId: 'booking-that-never-existed',
      title: 'إشعار',
      body: '...',
    }),
    'the linked booking must exist'
  );
});

test('a guest cannot create any notification', async () => {
  await signInAsAnonymous();
  await expectDenied(
    createNotification({ userId: OWNER_UID, bookingId: null, title: 'إشعار', body: '...' }),
    'guests have no notifications'
  );
});

/* ------------------------------------------------------------------ */
/* Content constraints (owner side)                                    */
/* ------------------------------------------------------------------ */

test('the owner may notify a client without a booking link', async () => {
  await signInAsOwner();
  const id = await createNotification({
    userId: CLIENT_A_UID,
    bookingId: null,
    title: 'تم قبول موعدك',
    body: '...',
  });
  assert.ok(id);
});

test('a notification cannot be back-dated (createdAt must be the request time)', async () => {
  await signInAsOwner();
  await expectDenied(
    createNotificationRaw({
      userId: CLIENT_A_UID,
      bookingId: null,
      title: 'قديم',
      body: '...',
      createdAt: Timestamp.fromMillis(Date.parse('2020-01-01T00:00:00Z')),
    }),
    'forging createdAt must be denied'
  );
});

test('a notification must carry the `read` flag as false', async () => {
  await signInAsOwner();
  await expectDenied(
    createNotificationRaw({
      userId: CLIENT_A_UID,
      bookingId: null,
      title: 'مقروء سلفاً',
      body: '...',
      read: true,
      createdAt: serverTimestamp(),
    }),
    'pre-marking a notification as read must be denied'
  );
});

/* ------------------------------------------------------------------ */
/* Reading and updating notifications                                  */
/* ------------------------------------------------------------------ */

test('the recipient may only flip the `read` flag', async () => {
  await signInAsOwner();
  const id = await createNotification({
    userId: CLIENT_A_UID,
    bookingId: null,
    title: 'تم قبول موعدك',
    body: '...',
  });

  await asClient(CLIENT_A_UID);
  await markRead(id); // allowed: only `read` changes
  const after = await readCollection('notifications');
  assert.equal(after.find((n) => n.id === id).read, true);

  await expectDenied(
    updateDoc(doc(db, 'notifications', id), { title: 'عنوان مفبرك' }),
    'clients must not rewrite their notifications'
  );
  await expectDenied(
    updateDoc(doc(db, 'notifications', id), { userId: OWNER_UID }),
    'clients must not re-address their notifications'
  );
});

test("a client cannot read another user's notifications", async () => {
  await signInAsOwner();
  const id = await createNotification({
    userId: CLIENT_A_UID,
    bookingId: null,
    title: 'خاص',
    body: '...',
  });

  await asClient(CLIENT_B_UID);
  await expectDenied(
    readOwnedNotification(id),
    'clients must not see foreign notifications'
  );

  // The owner (and the recipient) still can.
  await signInAsOwner();
  assert.ok(await readOwnedNotification(id), 'the owner reads every notification');
  await asClient(CLIENT_A_UID);
  assert.ok(await readOwnedNotification(id), 'the recipient reads their own');
});

/* ------------------------------------------------------------------ */
/* Real action path                                                    */
/* ------------------------------------------------------------------ */

test('the owner notifies the client when accepting a booking', async () => {
  const clientId = await bookingFor(CLIENT_A_UID, '14:00');
  const snap = await getDoc(doc(db, 'bookings', clientId));

  await signInAsOwner();
  await ownerAccept({ id: clientId, ...snap.data() }, { ownerUid: OWNER_UID });

  const all = await readCollection('notifications');
  assert.ok(
    all.some((n) => n.userId === CLIENT_A_UID && n.bookingId === clientId),
    'accepting a booking must notify its client'
  );
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Write a notification document directly (to test the raw field rules). */
async function createNotificationRaw(data) {
  await addDoc(collection(db, 'notifications'), {
    title: 'x',
    body: '',
    read: false,
    ...data,
  });
}

/** Read one notification as the CURRENT session (rules decide). */
async function readOwnedNotification(id) {
  const snap = await getDoc(doc(db, 'notifications', id));
  if (!snap.exists()) throw new Error('notification not readable');
  return snap.data();
}
