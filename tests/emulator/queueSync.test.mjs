/**
 * Queue sync (`useQueueSync` -> `publishQueueEntries`) against the Firestore
 * emulator with the REAL firestore.rules.
 *
 * The sync used to rewrite the whole `dailyQueue/{date}` document from the
 * owner's local bookings, which DELETED every entry the local snapshot did not
 * know about (cancelled bookings, entries written concurrently by a booking
 * transaction) and could roll a newer entry back to an older local value.
 *
 * These tests pin the new contract:
 *   1. add-only        — a stored entry is never deleted and never overwritten;
 *   2. transactional   — concurrent publishes both survive (no lost update);
 *   3. legacy tolerant — an Array document is converted without losing a key;
 *   4. refuse to lose  — an unkeyable document is left untouched, not truncated;
 *   5. cancellable     — a cleaned-up React effect publishes nothing;
 *   6. rules           — the hardened owner rules still allow every app write.
 *
 * Import order matters: helpers.mjs sets the env before src/config/firebase.js
 * is evaluated, so it is always imported first.
 */
import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import {
  bookingPayload,
  db,
  expectDenied,
  readBooking,
  readCollection,
  readQueue,
  seedLegacyQueue,
  seedPublicSettings,
  seedServices,
  signInAsAnonymous,
  signInAsOwner,
} from './helpers.mjs';
import { createBookingWithCheck, updateBooking } from '../../src/services/bookings.js';
import { publishQueueEntries } from '../../src/hooks/useQueueSync.js';

/** Days owned by this suite (other suites leave dailyQueue documents behind). */
const DAY = '2028-06-01';
const STALE_DAY = '2028-06-02';
const SYNCED_DAY = '2028-06-03';
const RACE_DAY = '2028-06-04';
const REAL_DAY = '2028-06-05';
const LEGACY_DAY = '2028-06-06';
const BROKEN_DAY = '2028-06-07';
const CANCELLED_DAY = '2028-06-08';
const RULES_DAY = '2028-06-09';
const CORRUPT_CREATE_DAY = '2028-06-10';
const CORRUPT_TARGET_DAY = '2028-06-11';
const MOVE_FROM_DAY = '2028-06-12';
const MISMATCH_DAY = '2028-06-13';

const entry = (bookingId, expectedStart, durationMinutes = 30, status = 'pending') => ({
  bookingId,
  expectedStart,
  durationMinutes,
  status,
});

/** Seed a `dailyQueue/{date}` document in the CURRENT Map shape (owner). */
async function seedMapQueue(date, entries) {
  await signInAsOwner();
  await setDoc(doc(db, 'dailyQueue', date), {
    date,
    entries,
    updatedAt: serverTimestamp(),
  });
}

test('setup: seed services and public settings', async () => {
  await seedServices();
  await seedPublicSettings();
  assert.ok(DAY);
});

test('publishing never deletes an entry the local snapshot does not know', async () => {
  // A cancelled booking and an accepted one are stored; the owner's screen has
  // not loaded the cancelled one (it is not part of the active queue).
  await seedMapQueue(DAY, {
    cancelled1: entry('cancelled1', '09:00', 30, 'cancelled'),
    active: entry('active', '10:00', 30, 'accepted'),
  });

  await signInAsOwner();
  const result = await publishQueueEntries(DAY, {
    active: entry('active', '10:00', 30, 'accepted'),
    newOne: entry('newOne', '11:00', 30, 'pending'),
  });

  assert.equal(result.written, true);
  assert.deepEqual(result.added, ['newOne'], 'only the missing entry is added');

  const entries = (await readQueue(DAY)).data().entries;
  assert.deepEqual(Object.keys(entries).sort(), ['active', 'cancelled1', 'newOne']);
  assert.deepEqual(entries.cancelled1, entry('cancelled1', '09:00', 30, 'cancelled'));
});

test('a stale local snapshot cannot overwrite a newer stored entry', async () => {
  // The stored entry was moved to 10:00 by a booking transaction a moment ago;
  // the owner's screen still holds the older 09:00/pending value.
  await seedMapQueue(STALE_DAY, { b1: entry('b1', '10:00', 30, 'accepted') });

  await signInAsOwner();
  await publishQueueEntries(STALE_DAY, {
    b1: entry('b1', '09:00', 30, 'pending'),
    b2: entry('b2', '11:00', 30, 'pending'),
  });

  const entries = (await readQueue(STALE_DAY)).data().entries;
  assert.deepEqual(entries.b1, entry('b1', '10:00', 30, 'accepted'), 'never rolled back');
  assert.deepEqual(entries.b2, entry('b2', '11:00', 30, 'pending'));
});

test('an already-synced day is not rewritten (no write churn)', async () => {
  await seedMapQueue(SYNCED_DAY, { x: entry('x', '09:00', 30, 'pending') });
  const before = (await readQueue(SYNCED_DAY)).data().updatedAt;

  await signInAsOwner();
  const result = await publishQueueEntries(SYNCED_DAY, { x: entry('x', '09:00', 30, 'pending') });

  assert.equal(result.written, false);
  assert.equal(result.reason, 'unchanged');
  const after = (await readQueue(SYNCED_DAY)).data().updatedAt;
  assert.equal(after.toMillis(), before.toMillis(), 'updatedAt must not move');
});

test('concurrent publishes of different entries keep both (no lost update)', async () => {
  await signInAsOwner();

  // Two "tabs" of the same owner app publish at the same instant. Both
  // transactions re-read the document, so the loser retries and merges
  // instead of clobbering the winner.
  const [first, second] = await Promise.all([
    publishQueueEntries(RACE_DAY, { a: entry('a', '09:00', 30, 'pending') }),
    publishQueueEntries(RACE_DAY, { b: entry('b', '10:00', 30, 'pending') }),
  ]);

  assert.ok(first.written && second.written, 'both publishes must commit');

  const entries = (await readQueue(RACE_DAY)).data().entries;
  assert.deepEqual(Object.keys(entries).sort(), ['a', 'b'], 'no entry may be lost');
});

test('the sync never undoes a real booking transaction', async () => {
  await signInAsAnonymous();
  const id = await createBookingWithCheck(
    bookingPayload({ date: REAL_DAY, time: '09:00', userId: null })
  );

  await signInAsOwner();

  // 1) an empty (still loading) snapshot must not clear the day.
  const empty = await publishQueueEntries(REAL_DAY, {});
  assert.equal(empty.written, false, 'there is nothing to add, so nothing is written');

  // 2) the owner moves the booking (booking transaction writes 12:00)...
  await updateBooking(id, { scheduledStart: '12:00', expectedStart: '12:00' });

  // ...and a stale screen still publishes the old 09:00 time.
  await publishQueueEntries(REAL_DAY, { [id]: entry(id, '09:00', 30, 'pending') });

  const entries = (await readQueue(REAL_DAY)).data().entries;
  assert.deepEqual(
    entries[id],
    entry(id, '12:00', 30, 'pending'),
    'the queue entry must mirror the booking, not the stale screen'
  );
});

test('a legacy Array document is converted without losing a stored entry', async () => {
  await seedLegacyQueue(LEGACY_DAY, [
    entry('old-a', '09:00', 30, 'pending'),
    entry('old-b', '10:00', 60, 'cancelled'),
  ]);

  await signInAsOwner();
  const result = await publishQueueEntries(LEGACY_DAY, { newC: entry('newC', '11:00') });

  assert.equal(result.written, true);

  const snap = await readQueue(LEGACY_DAY);
  assert.equal(Array.isArray(snap.data().entries), false, 'the document is a Map now');
  assert.equal(snap.data().date, LEGACY_DAY);
  assert.deepEqual(snap.data().entries['old-a'], entry('old-a', '09:00', 30, 'pending'));
  assert.deepEqual(snap.data().entries['old-b'], entry('old-b', '10:00', 60, 'cancelled'));
  assert.deepEqual(snap.data().entries.newC, entry('newC', '11:00'));
});

test('a document with an unkeyable entry is left untouched, not truncated', async () => {
  await seedLegacyQueue(BROKEN_DAY, [
    { expectedStart: '09:00', durationMinutes: 30, status: 'pending' }, // no bookingId
    entry('ok', '10:00', 30, 'pending'),
  ]);

  await signInAsOwner();
  const result = await publishQueueEntries(BROKEN_DAY, { extra: entry('extra', '11:00') });

  assert.equal(result.written, false);
  assert.equal(result.reason, 'unconvertible');

  const snap = await readQueue(BROKEN_DAY);
  assert.equal(Array.isArray(snap.data().entries), true, 'still readable in its Array shape');
  assert.equal(snap.data().entries.length, 2, 'nothing was dropped');
  assert.deepEqual(snap.data().entries[1], entry('ok', '10:00', 30, 'pending'));
});

test('a cancelled effect publishes nothing at all', async () => {
  await signInAsOwner();
  const result = await publishQueueEntries(
    CANCELLED_DAY,
    { z: entry('z', '09:00', 30, 'pending') },
    { isCancelled: () => true }
  );

  assert.equal(result.written, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal((await readQueue(CANCELLED_DAY)).exists(), false, 'the day document must not exist');
});

/* ------------------------------------------------------------------ */
/* Rules: the hardened owner rules still allow every app write         */
/* ------------------------------------------------------------------ */

test('the owner cannot write a queue document whose date is not its id', async () => {
  await signInAsOwner();
  await expectDenied(
    setDoc(doc(db, 'dailyQueue', RULES_DAY), {
      date: '2000-01-01',
      entries: {},
      updatedAt: serverTimestamp(),
    }),
    'a queue document must live under its own day'
  );
});

test('the owner cannot smuggle an unknown field into a queue document', async () => {
  await signInAsOwner();
  await expectDenied(
    setDoc(doc(db, 'dailyQueue', RULES_DAY), {
      date: RULES_DAY,
      entries: {},
      updatedAt: serverTimestamp(),
      legacyNotes: 'must not survive a rewrite',
    }),
    'only { date, entries, updatedAt } may be written'
  );
});

test('the owner may still seed, migrate and delete a queue document', async () => {
  await signInAsOwner();

  // Legacy Array seeding (what the migration reads) stays allowed.
  await setDoc(doc(db, 'dailyQueue', RULES_DAY), {
    date: RULES_DAY,
    entries: [entry('owner-seed', '09:00', 30, 'pending')],
    updatedAt: serverTimestamp(),
  });
  assert.equal(Array.isArray((await readQueue(RULES_DAY)).data().entries), true);

  // Map writes (the app's normal path) stay allowed: the Array is converted
  // in place by the sync, with the seeded entry carried over.
  await publishQueueEntries(RULES_DAY, {
    'owner-seed': entry('owner-seed', '09:00', 30, 'pending'),
  });
  const snap = await readQueue(RULES_DAY);
  assert.equal(Array.isArray(snap.data().entries), false, 'converted to a Map');
  assert.deepEqual(snap.data().entries['owner-seed'], entry('owner-seed', '09:00', 30, 'pending'));

  // Cleanup of a day document stays allowed (the owner resets a day).
  await deleteDoc(doc(db, 'dailyQueue', RULES_DAY));
  assert.equal((await readQueue(RULES_DAY)).exists(), false);
});

/* ------------------------------------------------------------------ */
/* Write paths refuse to convert data they would lose                  */
/* ------------------------------------------------------------------ */

/** Assert that `promise` rejects with a specific error `code`. */
async function expectCodeError(promise, code, message, re) {
  let err = null;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  assert.ok(err, `${message} — the operation unexpectedly succeeded`);
  assert.equal(err.code, code, `${message} — got ${err.code}: ${err.message}`);
  if (re) assert.match(err.message, re);
  return err;
}

test('creating a booking on a corrupt day aborts instead of dropping data', async () => {
  await seedLegacyQueue(CORRUPT_CREATE_DAY, [
    { expectedStart: '09:00', durationMinutes: 30, status: 'pending' }, // no bookingId
    entry('ok', '10:00', 30, 'pending'),
  ]);
  const before = (await readQueue(CORRUPT_CREATE_DAY)).data().entries;

  await signInAsAnonymous();
  await expectCodeError(
    createBookingWithCheck(
      bookingPayload({ date: CORRUPT_CREATE_DAY, time: '11:00', userId: null })
    ),
    'QUEUE_DATA_CORRUPT',
    'the create transaction must refuse a lossy conversion',
    /dailyQueue\/2028-06-10.*entries\[0\] has no bookingId/
  );

  // Nothing was written anywhere: the document is untouched and no booking
  // was created behind the aborted transaction.
  const after = (await readQueue(CORRUPT_CREATE_DAY)).data().entries;
  assert.equal(Array.isArray(after), true, 'the day stays in its Array shape');
  assert.equal(after.length, 2, 'both elements are still there');
  assert.deepEqual(after[0], before[0]);

  // Listing bookings needs the owner session (clients only see their own).
  await signInAsOwner();
  const orphaned = (await readCollection('bookings')).filter((b) => b.date === CORRUPT_CREATE_DAY);
  assert.deepEqual(orphaned, [], 'the aborted transaction created no booking');
});

test('an update that touches a corrupt day aborts with both sides unchanged', async () => {
  await seedLegacyQueue(CORRUPT_TARGET_DAY, [
    { expectedStart: '09:00', durationMinutes: 30, status: 'pending' }, // no bookingId
    entry('target-keep', '10:00', 30, 'pending'),
  ]);

  // A booking on a clean day, then try to move it INTO the corrupt day.
  await signInAsAnonymous();
  const id = await createBookingWithCheck(
    bookingPayload({ date: MOVE_FROM_DAY, time: '09:00', userId: null })
  );

  await signInAsOwner();
  await expectCodeError(
    updateBooking(id, { date: CORRUPT_TARGET_DAY, scheduledStart: '10:00', expectedStart: '10:00' }),
    'QUEUE_DATA_CORRUPT',
    'the move transaction must refuse to rewrite a lossy document',
    /dailyQueue\/2028-06-11/
  );

  // The booking is untouched...
  assert.equal((await readBooking(id)).data().date, MOVE_FROM_DAY, 'the booking did not move');
  // ...and so are both day documents.
  const fromEntries = (await readQueue(MOVE_FROM_DAY)).data().entries;
  assert.ok(fromEntries[id], 'the entry still lives on the source day');
  const targetEntries = (await readQueue(CORRUPT_TARGET_DAY)).data().entries;
  assert.equal(Array.isArray(targetEntries), true, 'the corrupt day was not rewritten');
  assert.equal(targetEntries.length, 2, 'no element was dropped');
});

test('a key/value mismatch is repaired by a write (non-lossy policy)', async () => {
  // The value carries bookingId `real-1` under the wrong key `wrongKey`:
  // nothing would be lost by re-keying it, so the write must proceed.
  await seedMapQueue(MISMATCH_DAY, {
    wrongKey: entry('real-1', '09:00', 30, 'pending'),
  });

  await signInAsOwner();
  const id = await createBookingWithCheck(
    bookingPayload({ date: MISMATCH_DAY, time: '11:00', userId: null })
  );

  const entries = (await readQueue(MISMATCH_DAY)).data().entries;
  assert.equal(entries.wrongKey, undefined, 'the wrong key is gone');
  assert.deepEqual(entries['real-1'], entry('real-1', '09:00', 30, 'pending'), 'entry preserved');
  assert.deepEqual(entries[id], entry(id, '11:00', 30, 'pending'), 'the new entry was added');
});
