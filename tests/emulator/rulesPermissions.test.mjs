/**
 * Security-rules permission matrix, exercised against the REAL firestore.rules
 * on the emulator (auth + firestore).
 *
 * Covers the hardening goals of this branch:
 *  - bookings are private (the owner reads all, a client reads only their own);
 *  - a client can only perform the four allowed transitions, cannot mix
 *    free-form edits into them, and cannot move a booking without its queue;
 *  - `dailyQueue` stays publicly readable (PII-free) but a non-owner can only
 *    add/modify/remove ONE entry, and only when it belongs to a booking they
 *    own — never someone else's, never a wholesale rewrite;
 *  - a legacy Array document cannot be "migrated" by a client in a way that
 *    silently drops other people's entries.
 *
 * Import order matters: helpers.mjs sets the env before src/config/firebase.js
 * is evaluated, so it is always imported first.
 */
import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';

import {
  CLIENT_A_UID,
  CLIENT_B_UID,
  OWNER_UID,
  SERVICE_ID,
  bookingPayload,
  db,
  expectDenied,
  readBooking,
  readQueue,
  seedLegacyQueue,
  seedPublicSettings,
  seedServices,
  signInAs,
  signInAsAnonymous,
  signInAsClient,
  signInAsOwner,
} from './helpers.mjs';
import { createBookingWithCheck } from '../../src/services/bookings.js';

const DAY = '2026-12-15';
const OTHER_DAY = '2026-12-16';

test('setup: seed services and public settings as the owner', async () => {
  await seedServices();
  await seedPublicSettings();
  assert.equal(typeof OWNER_UID, 'string');
});

/** A booking owned by `uid` (defaults to CLIENT_A_UID) on `date` at `time`. */
async function bookingOf(date, time, uid = CLIENT_A_UID) {
  await signInAs(uid, { email: emailOf(uid), email_verified: true });
  return createBookingWithCheck(
    bookingPayload({ date, time, userId: uid, name: `زبون ${uid}` })
  );
}

const emailOf = (uid) => (uid === CLIENT_B_UID ? 'client.b@example.com' : 'client.a@example.com');

function queueHasEntry(queueSnap, bookingId) {
  const entries = queueSnap.data()?.entries;
  if (Array.isArray(entries)) return entries.some((e) => e?.bookingId === bookingId);
  return Boolean(entries && entries[bookingId]);
}

/* ------------------------------------------------------------------ */
/* Booking privacy                                                     */
/* ------------------------------------------------------------------ */

test('a guest cannot read any booking', async () => {
  const id = await bookingOf(DAY, '09:00');
  await signInAsAnonymous();
  await expectDenied(readBooking(id), 'guests must not read bookings');
});

test("a client cannot read another client's booking", async () => {
  const id = await bookingOf(DAY, '10:00');
  await signInAsClient(CLIENT_B_UID, emailOf(CLIENT_B_UID));
  await expectDenied(readBooking(id), 'clients must not read foreign bookings');
});

test('the owner reads every booking', async () => {
  const id = await bookingOf(DAY, '11:00');
  await signInAsOwner();
  const snap = await readBooking(id);
  assert.equal(snap.exists(), true);
  assert.equal(snap.data().userId, CLIENT_A_UID);
});

test('a guest booking is readable by nobody but the owner', async () => {
  await signInAsAnonymous();
  const id = await createBookingWithCheck(
    bookingPayload({ date: DAY, time: '12:00', userId: null })
  );
  await signInAsClient();
  await expectDenied(readBooking(id), 'guest bookings stay private');
  await signInAsOwner();
  assert.equal((await readBooking(id)).exists(), true);
});

/* ------------------------------------------------------------------ */
/* Booking write restrictions                                           */
/* ------------------------------------------------------------------ */

test('a signed-in client cannot book on behalf of another uid', async () => {
  await signInAsClient(CLIENT_A_UID, emailOf(CLIENT_A_UID));
  await expectDenied(
    createBookingWithCheck(bookingPayload({ date: DAY, time: '18:00', userId: CLIENT_B_UID })),
    'impersonating another uid must be denied'
  );
});

test('a client cannot sneak free-form edits into a cancellation', async () => {
  const id = await bookingOf(DAY, '13:00');
  await signInAsClient();

  // status -> cancelled AND price -> 1: the rules allow only the first.
  await expectDenied(
    updateDoc(doc(db, 'bookings', id), {
      status: 'cancelled',
      price: 1,
      updatedAt: serverTimestamp(),
    }),
    'mixing a price change into a cancellation must be denied'
  );

  const snap = await readBooking(id);
  assert.notEqual(snap.data().status, 'cancelled', 'the whole write must be rolled back');
  assert.equal(snap.data().price, 1000, 'the price must be unchanged');
});

test('a client cannot move a booking to another date without its queue entry', async () => {
  const id = await bookingOf(DAY, '15:00');
  await signInAsClient();

  // The shape the OLD client code used: patch the booking only, no queue sync.
  await expectDenied(
    updateDoc(doc(db, 'bookings', id), { date: OTHER_DAY, updatedAt: serverTimestamp() }),
    'changing the date without updating the queue must be denied'
  );

  const snap = await readBooking(id);
  assert.equal(snap.data().date, DAY, 'the booking must be untouched');
  assert.ok(queueHasEntry(await readQueue(DAY), id), 'the old entry must still be there');
});

test('a client cannot create a booking with a forged status or source', async () => {
  await signInAsClient();
  await expectDenied(
    createBookingWithCheck(
      bookingPayload({ date: DAY, time: '16:00', userId: CLIENT_A_UID, status: 'accepted' })
    ),
    'clients must not self-approve'
  );
  await expectDenied(
    createBookingWithCheck(
      bookingPayload({ date: DAY, time: '16:30', userId: CLIENT_A_UID, source: 'walk_in' })
    ),
    'clients must not book as a walk-in'
  );
});

test('a booking must match a real, active service (price/name/duration)', async () => {
  await signInAsClient();
  await expectDenied(
    createBookingWithCheck(
      bookingPayload({ date: DAY, time: '17:00', userId: CLIENT_A_UID, price: 1 })
    ),
    'a price that does not match the service must be denied'
  );
  await expectDenied(
    createBookingWithCheck(
      bookingPayload({ date: DAY, time: '17:30', userId: CLIENT_A_UID, serviceName: 'غير موجودة' })
    ),
    'a service name that does not match must be denied'
  );
});

test('only the owner may delete a booking', async () => {
  const id = await bookingOf(DAY, '09:30');
  await signInAsClient();
  await expectDenied(deleteDoc(doc(db, 'bookings', id)), 'clients must not delete bookings');
  await signInAsOwner();
  await deleteDoc(doc(db, 'bookings', id));
  assert.equal((await readBooking(id)).exists(), false);
});

/* ------------------------------------------------------------------ */
/* dailyQueue: public read, tightly scoped write                       */
/* ------------------------------------------------------------------ */

test('the queue document is publicly readable (PII-free)', async () => {
  await signInAsAnonymous();
  const queue = await readQueue(DAY);
  assert.equal(queue.exists(), true, 'clients read the queue to pick free slots');
});

test('a client cannot rewrite another client’s queue entry', async () => {
  const mine = await bookingOf(DAY, '08:00');
  const theirs = await bookingOf(DAY, '08:30', CLIENT_B_UID);

  await signInAsClient(); // CLIENT_A_UID
  await expectDenied(
    updateDoc(doc(db, 'dailyQueue', DAY), {
      [`entries.${theirs}`]: {
        bookingId: theirs,
        expectedStart: '23:00',
        durationMinutes: 30,
        status: 'pending',
      },
    }),
    'tampering with someone else’s entry must be denied'
  );

  await signInAsOwner();
  const queue = await readQueue(DAY);
  assert.equal(queue.data().entries[theirs].expectedStart, '08:30');
  assert.ok(queue.data().entries[mine], 'my own entry must be untouched too');
});

test('a client cannot clear a whole day or inject several entries at once', async () => {
  await bookingOf(DAY, '07:00');
  await bookingOf(DAY, '07:30', CLIENT_B_UID);

  await signInAsClient();
  await expectDenied(
    updateDoc(doc(db, 'dailyQueue', DAY), { entries: {} }),
    'emptying a day must be denied'
  );
  await expectDenied(
    updateDoc(doc(db, 'dailyQueue', DAY), {
      'entries.forged-1': {
        bookingId: 'forged-1',
        expectedStart: '08:00',
        durationMinutes: 30,
        status: 'pending',
      },
      'entries.forged-2': {
        bookingId: 'forged-2',
        expectedStart: '08:30',
        durationMinutes: 30,
        status: 'pending',
      },
    }),
    'two entries in one write must be denied'
  );
});

test('a queue entry may not claim a booking id that does not exist', async () => {
  await signInAsClient();
  await expectDenied(
    updateDoc(doc(db, 'dailyQueue', DAY), {
      'entries.ghost-booking': {
        bookingId: 'ghost-booking',
        expectedStart: '09:00',
        durationMinutes: 30,
        status: 'pending',
      },
    }),
    'entries must be bound to a real booking'
  );
});

test('a client cannot move their entry onto a day their booking is not on', async () => {
  const id = await bookingOf(DAY, '06:00');
  await signInAsClient();

  await expectDenied(
    updateDoc(doc(db, 'dailyQueue', OTHER_DAY), {
      [`entries.${id}`]: {
        bookingId: id,
        expectedStart: '06:00',
        durationMinutes: 30,
        status: 'pending',
      },
    }),
    'an entry must live on the day its booking is on'
  );
});

/* ------------------------------------------------------------------ */
/* Legacy Array documents cannot be silently emptied by a client       */
/* ------------------------------------------------------------------ */

test('a client cannot "migrate" a legacy day in a way that drops other entries', async () => {
  const day = '2026-12-20';
  const foreign = {
    bookingId: 'legacy-foreign-1',
    expectedStart: '10:00',
    durationMinutes: 30,
    status: 'pending',
  };
  const mine = {
    bookingId: 'legacy-mine-1',
    expectedStart: '11:00',
    durationMinutes: 30,
    status: 'pending',
  };
  await seedLegacyQueue(day, [foreign, mine]);
  await signInAsAnonymous();

  await expectDenied(
    updateDoc(doc(db, 'dailyQueue', day), { entries: { 'legacy-mine-1': mine } }),
    'dropping a foreign entry during migration must be denied'
  );

  await signInAsOwner();
  const queue = await readQueue(day);
  assert.equal(Array.isArray(queue.data().entries), true, 'the legacy doc must be intact');
  assert.equal(queue.data().entries.length, 2);
});

test('a pure Array -> Map shape conversion preserves every entry', async () => {
  const day = '2026-12-21';
  const entries = [
    { bookingId: 'shape-1', expectedStart: '09:00', durationMinutes: 30, status: 'pending' },
    { bookingId: 'shape-2', expectedStart: '09:30', durationMinutes: 60, status: 'accepted' },
  ];
  await seedLegacyQueue(day, entries);
  await signInAsAnonymous();

  // Content-identical conversion: no entry lost, no entry added.
  await updateDoc(doc(db, 'dailyQueue', day), {
    entries: Object.fromEntries(entries.map((e) => [e.bookingId, e])),
  });

  await signInAsOwner();
  const queue = await readQueue(day);
  assert.equal(Array.isArray(queue.data().entries), false, 'now a Map');
  assert.equal(Object.keys(queue.data().entries).length, 2);
});

/* ------------------------------------------------------------------ */
/* Settings & services                                                 */
/* ------------------------------------------------------------------ */

test('a client cannot write the public settings', async () => {
  await signInAsClient();
  await expectDenied(
    updateDoc(doc(db, 'settings', 'public'), { ownerUid: CLIENT_A_UID }),
    'clients must not republish the owner uid'
  );
  // Restore the real owner uid for the rest of the suite.
  await seedPublicSettings();
});

test('services are publicly readable but owner-writable only', async () => {
  await signInAsAnonymous();
  await expectDenied(
    updateDoc(doc(db, 'services', SERVICE_ID), { price: 1 }),
    'clients must not edit services'
  );
  await signInAsOwner();
  await updateDoc(doc(db, 'services', SERVICE_ID), { price: 1000 });
});
