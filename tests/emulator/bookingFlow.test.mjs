/**
 * End-to-end booking flow against the Firestore emulator + real firestore.rules.
 *
 * Exercises the REAL service modules (src/services/*):
 *   - atomic booking + queue creation (guest and signed-in client)
 *   - double-booking prevention (SlotTakenError)
 *   - rejection of bookings written without their queue entry (or with a
 *     mismatched one) — the atomicity the rules enforce
 *   - cancellation, proposals, accept/decline of a modified time
 *   - rescheduling across dates (entry moves between dailyQueue documents)
 *   - owner walk-in bookings and a multi-booking shift in ONE transaction
 *
 * Import order matters: helpers.mjs sets the env before src/config/firebase.js
 * is evaluated, so it is always imported first.
 */
import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { doc, setDoc, writeBatch } from 'firebase/firestore';

import {
  CLIENT_A_UID,
  OWNER_UID,
  SERVICE_ID,
  bookingPayload,
  db,
  expectDenied,
  readBooking,
  readCollection,
  readQueue,
  seedPublicSettings,
  seedServices,
  signInAsAnonymous,
  signInAsClient,
  signInAsOwner,
} from './helpers.mjs';
import {
  SlotTakenError,
  assertSlotFree,
  createBookingWithCheck,
} from '../../src/services/bookings.js';
import {
  clientAcceptModification,
  clientCancelBooking,
  clientDeclineModification,
  clientProposeTime,
  ownerAcceptModified,
  ownerApplyShift,
  ownerCreateWalkIn,
} from '../../src/services/bookingActions.js';
import { busyFromQueue, queueEntryOf, timeToMinEntry } from './asserts.mjs';

const settings = { ownerUid: OWNER_UID };

/** Fresh booking id created under the current session. */
async function createBooking(fields) {
  return createBookingWithCheck(bookingPayload(fields));
}

test('setup: seed services and public settings as the owner', async () => {
  await seedServices();
  await seedPublicSettings();
  assert.ok(SERVICE_ID);
});

test('guest booking writes the booking and its queue Map entry atomically', async () => {
  await signInAsAnonymous();
  const id = await createBooking({ date: '2026-12-01', time: '10:00', userId: null });

  const queue = await readQueue('2026-12-01');
  assert.ok(queue.exists(), 'the dailyQueue document must exist');
  const entries = queue.data().entries;
  assert.equal(Array.isArray(entries), false, 'entries must be a Map, not an Array');
  assert.deepEqual(entries[id], {
    bookingId: id,
    expectedStart: '10:00',
    durationMinutes: 30,
    status: 'pending',
  });
  assert.equal(queue.data().date, '2026-12-01');

  // The booking itself is private (owner read).
  await signInAsOwner();
  const booking = await readBooking(id);
  assert.equal(booking.exists(), true);
  assert.equal(booking.data().userId, null);
  assert.equal(booking.data().status, 'pending');
  assert.equal(booking.data().source, 'online');
});

test('overlapping booking is rejected, adjacent slot succeeds', async () => {
  await signInAsAnonymous();
  // 10:00 + 30m is busy -> 10:15 conflicts.
  await assert.rejects(
    () => createBooking({ date: '2026-12-01', time: '10:15', userId: null }),
    (err) => err instanceof SlotTakenError || err?.code === 'SLOT_TAKEN'
  );
  // 10:30 starts exactly when the first ends -> allowed.
  const id = await createBooking({ date: '2026-12-01', time: '10:30', userId: null });
  const queue = await readQueue('2026-12-01');
  assert.deepEqual(queue.data().entries[id].expectedStart, '10:30');
});

test('a booking written WITHOUT its queue entry is rejected by the rules', async () => {
  await signInAsClient();
  const ref = doc(db, 'bookings');
  await expectDenied(
    setDoc(
      ref,
      bookingPayload({
        date: '2026-12-01',
        time: '12:00',
        userId: CLIENT_A_UID,
      })
    ),
    'booking without queue entry must be denied'
  );
});

test('a queue entry that does not match its booking is rejected (same request)', async () => {
  await signInAsClient();

  // Wrong expectedStart (13:30 vs the booking's 13:00) -> rules deny the batch.
  const bookingRef = doc(db, 'bookings');
  const payload = bookingPayload({
    date: '2026-12-01',
    time: '13:00',
    userId: CLIENT_A_UID,
  });
  const mismatched = writeBatch(db);
  mismatched.set(bookingRef, payload);
  mismatched.update(doc(db, 'dailyQueue', '2026-12-01'), {
    [`entries.${bookingRef.id}`]: {
      bookingId: bookingRef.id,
      expectedStart: '13:30',
      durationMinutes: 30,
      status: 'pending',
    },
  });
  await expectDenied(mismatched.commit(), 'mismatched queue entry must be denied');

  // Same request with a matching entry -> allowed (positive control).
  const matching = writeBatch(db);
  matching.set(bookingRef, payload);
  matching.update(doc(db, 'dailyQueue', '2026-12-01'), {
    [`entries.${bookingRef.id}`]: {
      bookingId: bookingRef.id,
      expectedStart: '13:00',
      durationMinutes: 30,
      status: 'pending',
    },
  });
  await matching.commit();
  const queue = await readQueue('2026-12-01');
  assert.deepEqual(queue.data().entries[bookingRef.id].expectedStart, '13:00');
});

test('client cancellation updates booking + queue and frees the slot', async () => {
  await signInAsClient();
  const id = await createBooking({
    date: '2026-12-02',
    time: '14:00',
    userId: CLIENT_A_UID,
    name: 'عميل أ',
  });
  const snap = await readBooking(id);
  const booking = { id: snap.id, ...snap.data() };

  await clientCancelBooking(booking, settings);

  const after = await readBooking(id);
  assert.equal(after.data().status, 'cancelled');

  const queue = await readQueue('2026-12-02');
  assert.deepEqual(queueEntryOf(queue.data(), id), {
    bookingId: id,
    expectedStart: '14:00',
    durationMinutes: 30,
    status: 'cancelled',
  });
  // The slot no longer blocks other clients.
  const busy = busyFromQueue(queue.data());
  assert.equal(
    busy.some((b) => b.start <= timeToMinEntry('14:00') && timeToMinEntry('14:00') < b.end),
    false
  );

  // The rules let the client notify the owner about their decision.
  await signInAsOwner();
  const notifications = await readCollection('notifications');
  assert.ok(
    notifications.some((n) => n.bookingId === id && n.userId === OWNER_UID),
    'the client->owner notification must exist'
  );
});

test('accepting a modified time moves the entry between dailyQueue dates', async () => {
  const from = '2026-12-03';
  const to = '2026-12-04';

  await signInAsClient();
  const id = await createBooking({ date: from, time: '15:00', userId: CLIENT_A_UID });
  const created = await readBooking(id);

  // Barber proposes another day/time (owner session).
  await signInAsOwner();
  await ownerAcceptModified(
    { id, ...created.data() },
    { date: to, time: '11:00', note: 'موعد بديل' },
    settings
  );
  // While the client has not answered, the entry still belongs to the old day
  // but already shows the new status.
  assert.deepEqual(queueEntryOf((await readQueue(from)).data(), id), {
    bookingId: id,
    expectedStart: '15:00',
    durationMinutes: 30,
    status: 'accepted_modified',
  });

  // Client accepts -> one transaction rewrites the booking and BOTH dates.
  await signInAsClient();
  const modified = await readBooking(id);
  await clientAcceptModification({ id, ...modified.data() }, settings);

  const moved = await readBooking(id);
  assert.equal(moved.data().date, to);
  assert.equal(moved.data().scheduledStart, '11:00');
  assert.equal(moved.data().expectedStart, '11:00');
  assert.equal(moved.data().status, 'accepted');
  assert.equal(moved.data().proposedDate, null);

  assert.equal(
    queueEntryOf((await readQueue(from)).data(), id),
    null,
    'the entry must leave the previous day document'
  );
  assert.deepEqual(queueEntryOf((await readQueue(to)).data(), id), {
    bookingId: id,
    expectedStart: '11:00',
    durationMinutes: 30,
    status: 'accepted',
  });
});

test('proposing another time keeps the booking date and queue entry intact', async () => {
  const day = '2026-12-05';
  await signInAsClient();
  const id = await createBooking({ date: day, time: '10:00', userId: CLIENT_A_UID });
  const booking = { id, ...(await readBooking(id)).data() };

  // The target slot must really be free (10:00 is taken by this booking).
  await assert.rejects(
    () => assertSlotFree(day, '10:00', 30),
    (err) => err?.code === 'SLOT_TAKEN'
  );
  await assertSlotFree(day, '16:00', 30);

  await clientProposeTime(booking, { date: '2026-12-06', time: '12:00' }, settings);

  const after = await readBooking(id);
  assert.equal(after.data().status, 'pending');
  assert.equal(after.data().clientProposedDate, '2026-12-06');
  assert.equal(after.data().clientProposedTime, '12:00');
  assert.equal(after.data().date, day, 'a proposal must not move the booking');

  assert.deepEqual(queueEntryOf((await readQueue(day)).data(), id), {
    bookingId: id,
    expectedStart: '10:00',
    durationMinutes: 30,
    status: 'pending',
  });
});

test('declining a modification returns the booking and its entry to pending', async () => {
  const day = '2026-12-07';
  await signInAsClient();
  const id = await createBooking({ date: day, time: '09:00', userId: CLIENT_A_UID });

  await signInAsOwner();
  const created = await readBooking(id);
  await ownerAcceptModified(
    { id, ...created.data() },
    { date: day, time: '09:45', note: 'تأخير بسيط' },
    settings
  );

  await signInAsClient();
  const modified = await readBooking(id);
  await clientDeclineModification({ id, ...modified.data() }, settings);

  const after = await readBooking(id);
  assert.equal(after.data().status, 'pending');
  assert.equal(after.data().proposedDate, null);
  assert.equal(after.data().barberMessage, '');

  assert.deepEqual(queueEntryOf((await readQueue(day)).data(), id), {
    bookingId: id,
    expectedStart: '09:00',
    durationMinutes: 30,
    status: 'pending',
  });
});

test('owner walk-in booking is stored with its queue entry', async () => {
  const day = '2026-12-08';
  await signInAsOwner();
  const id = await ownerCreateWalkIn(
    {
      name: 'زبون عابر',
      phone: '+213551234500',
      serviceId: SERVICE_ID,
      serviceName: 'قص شعر',
      price: 1000,
      durationMinutes: 30,
      date: day,
      time: '10:00',
    },
    settings
  );

  const booking = await readBooking(id);
  assert.equal(booking.data().source, 'walk_in');
  assert.equal(booking.data().status, 'accepted');
  assert.equal(booking.data().userId, null);
  assert.deepEqual(queueEntryOf((await readQueue(day)).data(), id), {
    bookingId: id,
    expectedStart: '10:00',
    durationMinutes: 30,
    status: 'accepted',
  });
});

test('owner shifts several bookings in ONE transaction (booking + queue together)', async () => {
  const day = '2026-12-09';
  await signInAsClient();
  const id1 = await createBooking({ date: day, time: '10:00', userId: CLIENT_A_UID });
  const id2 = await createBooking({ date: day, time: '10:30', userId: CLIENT_A_UID });

  await signInAsOwner();
  const b1 = { id: id1, ...(await readBooking(id1)).data() };
  const b2 = { id: id2, ...(await readBooking(id2)).data() };

  await ownerApplyShift(
    [
      { booking: b1, newStart: '10:15', newEnd: '10:45', shift: 15 },
      { booking: b2, newStart: '11:00', newEnd: '11:30', shift: 30 },
    ],
    settings
  );

  assert.equal((await readBooking(id1)).data().expectedStart, '10:15');
  assert.equal((await readBooking(id2)).data().expectedStart, '11:00');
  const queue = await readQueue(day);
  assert.equal(queueEntryOf(queue.data(), id1).expectedStart, '10:15');
  assert.equal(queueEntryOf(queue.data(), id2).expectedStart, '11:00');
  assert.equal(queueEntryOf(queue.data(), id1).durationMinutes, 30);
});
