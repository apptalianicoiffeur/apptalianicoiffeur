/**
 * Legacy `dailyQueue` Array -> Map migration.
 *
 * Verifies the three properties the migration must guarantee:
 *  1. lossless  — every entry survives with all four fields, nothing dropped;
 *  2. idempotent — a second run reports 0 migrated and rewrites nothing;
 *  3. progressive — even before the migration runs, a booking write normalizes
 *     its OWN day document (and moves entries off the previous day) without
 *     touching the entries of other bookings.
 *
 * Import order matters: helpers.mjs sets the env before src/config/firebase.js
 * is evaluated, so it is always imported first.
 */
import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIENT_A_UID,
  OWNER_UID,
  bookingPayload,
  readQueue,
  seedLegacyQueue,
  seedPublicSettings,
  seedServices,
  signInAsAnonymous,
  signInAsOwner,
} from './helpers.mjs';
import { createBookingWithCheck, updateBooking } from '../../src/services/bookings.js';
import { migrateLegacyQueueDocs } from '../../src/services/queueMigration.js';
import { queueEntryOf, queueEntriesList } from '../../src/utils/queue.js';

const entry = (bookingId, expectedStart, durationMinutes = 30, status = 'pending') => ({
  bookingId,
  expectedStart,
  durationMinutes,
  status,
});

// The migration reports are collection-wide, so these tests pin the day
// documents they own: other suites leave dailyQueue documents behind.
const DAYS = ['2027-01-01', '2027-01-02', '2027-01-03'];

test('setup: seed services and public settings', async () => {
  await seedServices();
  await seedPublicSettings();
  assert.equal(typeof OWNER_UID, 'string');
});

test('the dry run reports the legacy documents without writing anything', async () => {
  await seedLegacyQueue('2027-01-01', [entry('a1', '09:00'), entry('a2', '09:30', 60)]);
  await seedLegacyQueue('2027-01-02', [entry('b1', '10:00')]);
  // A document already using the Map shape must be counted as skipped.
  await seedLegacyQueue('2027-01-03', { c1: entry('c1', '11:00') });

  await signInAsOwner();
  const report = await migrateLegacyQueueDocs({ dryRun: true, days: DAYS });

  assert.equal(report.scanned, 3);
  assert.equal(report.migrated, 2, 'the two Array documents would be converted');
  assert.equal(report.skipped, 1, 'the Map document is left alone');
  assert.deepEqual(report.dropped, [], 'every legacy element carries a bookingId');

  // Nothing was written.
  assert.equal(Array.isArray((await readQueue('2027-01-01')).data().entries), true);
  assert.equal((await readQueue('2027-01-01')).data().entries.length, 2);
});

test('the migration converts every Array document without losing an entry', async () => {
  await signInAsOwner();
  const report = await migrateLegacyQueueDocs({ days: DAYS });

  assert.equal(report.migrated, 2);
  assert.equal(report.skipped, 1);
  assert.deepEqual(report.dropped, []);

  const day1 = await readQueue('2027-01-01');
  assert.equal(Array.isArray(day1.data().entries), false, 'entries must be a Map now');
  assert.deepEqual(day1.data().entries.a1, entry('a1', '09:00'));
  assert.deepEqual(day1.data().entries.a2, entry('a2', '09:30', 60));
  assert.equal(day1.data().date, '2027-01-01', 'the stored date is preserved');

  const day2 = await readQueue('2027-01-02');
  assert.deepEqual(day2.data().entries.b1, entry('b1', '10:00'));

  // The already-converted document is untouched (same content, same shape).
  assert.deepEqual((await readQueue('2027-01-03')).data().entries.c1, entry('c1', '11:00'));
});

test('a second run is a no-op (idempotent)', async () => {
  await signInAsOwner();
  const before = (await readQueue('2027-01-01')).data();

  const report = await migrateLegacyQueueDocs({ days: DAYS });

  assert.equal(report.migrated, 0, 'nothing left to migrate');
  assert.equal(report.skipped, 3, 'every document is already a Map');
  assert.deepEqual(report.dropped, []);

  const after = (await readQueue('2027-01-01')).data();
  assert.deepEqual(after.entries, before.entries, 'the entries must not change');
});

test('a queue entry that cannot be keyed is reported, not silently lost', async () => {
  // A legacy element without a bookingId cannot become a Map key: the report
  // names it so the owner can decide, instead of dropping it invisibly.
  await seedLegacyQueue('2027-02-01', [{ expectedStart: '09:00', durationMinutes: 30 }]);

  await signInAsOwner();
  const report = await migrateLegacyQueueDocs({ dryRun: true, days: ['2027-02-01'] });
  const affected = report.dropped.filter((d) => d.day === '2027-02-01');

  assert.equal(affected.length, 1);
  assert.match(affected[0].reason, /entries\[0\] has no bookingId/);
});

test('readers keep working on an UNMIGRATED legacy document', async () => {
  await seedLegacyQueue('2027-03-01', [entry('r1', '09:00'), entry('r2', '09:30', 60, 'accepted')]);

  // The shape-tolerant helpers must expose both entries in queue order,
  // which is exactly what the client slot picker and the owner panel use.
  const queue = await readQueue('2027-03-01');
  const list = queueEntriesList(queue.data());

  assert.deepEqual(
    list.map((e) => e.bookingId),
    ['r1', 'r2']
  );
  assert.deepEqual(queueEntryOf(queue.data(), 'r2'), entry('r2', '09:30', 60, 'accepted'));
  assert.equal(queueEntryOf(queue.data(), 'nope'), null);
});

test('a booking write normalizes ITS OWN legacy day document progressively', async () => {
  const day = '2027-04-01';
  await seedLegacyQueue(day, [entry('keep-me', '09:00'), entry('also-keep', '10:00', 60)]);

  // A guest books at 11:00 on that legacy day.
  await signInAsAnonymous();
  const id = await createBookingWithCheck(
    bookingPayload({ date: day, time: '11:00', userId: null })
  );

  const queue = await readQueue(day);
  assert.equal(Array.isArray(queue.data().entries), false, 'the day became a Map');
  // The two pre-existing entries survived untouched...
  assert.deepEqual(queue.data().entries['keep-me'], entry('keep-me', '09:00'));
  assert.deepEqual(queue.data().entries['also-keep'], entry('also-keep', '10:00', 60));
  // ...and the new one was added.
  assert.deepEqual(queue.data().entries[id], {
    bookingId: id,
    expectedStart: '11:00',
    durationMinutes: 30,
    status: 'pending',
  });
});

test('moving a booking off a legacy day removes only its own entry', async () => {
  const from = '2027-05-01';
  const to = '2027-05-02';
  await seedLegacyQueue(from, [entry('stays-put', '09:00'), entry('mover', '09:30')]);

  // The two legacy entries are real reservations, so the new booking has to
  // take a slot that is actually free on that day.
  await signInAsAnonymous();
  const id = await createBookingWithCheck(
    bookingPayload({ date: from, time: '11:00', userId: null })
  );

  // Move it to another day (owner session: the only role allowed to shift).
  await signInAsOwner();
  await updateBooking(id, { date: to, scheduledStart: '12:00', expectedStart: '12:00' });

  const fromQueue = await readQueue(from);
  assert.equal(Array.isArray(fromQueue.data().entries), false);
  assert.equal(
    queueEntryOf(fromQueue.data(), id),
    null,
    'the moved booking must leave its old day'
  );
  assert.deepEqual(
    queueEntryOf(fromQueue.data(), 'stays-put'),
    entry('stays-put', '09:00'),
    'the other entries must stay exactly as they were'
  );
  assert.deepEqual(
    queueEntryOf(fromQueue.data(), 'mover'),
    entry('mover', '09:30'),
    'the other entries must stay exactly as they were'
  );

  const toQueue = await readQueue(to);
  // The booking keeps its `pending` status; only the day and time changed.
  assert.deepEqual(queueEntryOf(toQueue.data(), id), {
    bookingId: id,
    expectedStart: '12:00',
    durationMinutes: 30,
    status: 'pending',
  });
});
