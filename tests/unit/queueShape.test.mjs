/**
 * Unit tests for the dailyQueue entry-shape helpers (no emulator needed).
 *
 * Covers both stored shapes:
 *   - legacy Array: entries: [{ bookingId, expectedStart, ... }, ...]
 *   - current Map:  entries: { [bookingId]: { bookingId, ... } }
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  busyFromQueue,
  entriesToMap,
  isLegacyEntries,
  queueEntriesAsBookings,
  queueEntriesKey,
  queueEntriesList,
  queueEntriesMap,
  queueEntryFromBooking,
  queueEntryMatches,
  queueEntryOf,
} from '../../src/utils/queue.js';
import { STATUS } from '../../src/utils/constants.js';

const E1 = { bookingId: 'b2', expectedStart: '11:00', durationMinutes: 30, status: 'pending' };
const E2 = { bookingId: 'b1', expectedStart: '10:00', durationMinutes: 45, status: 'accepted' };
const E3 = { bookingId: 'b3', expectedStart: '09:30', durationMinutes: 20, status: 'cancelled' };

test('entriesToMap: legacy Array is keyed by bookingId', () => {
  const map = entriesToMap([E2, E1]);
  assert.deepEqual(Object.keys(map).sort(), ['b1', 'b2']);
  assert.deepEqual(map.b1, E2);
  assert.deepEqual(map.b2, E1);
  assert.equal(isLegacyEntries([E2]), true);
  assert.equal(isLegacyEntries(map), false);
});

test('entriesToMap: Map keeps values and re-keys by the element bookingId', () => {
  const stored = { wrongKey: { ...E1 } };
  const map = entriesToMap(stored);
  assert.deepEqual(Object.keys(map), ['b2']);
  // the key and the value can never disagree after normalization
  assert.equal(map.b2.bookingId, 'b2');
});

test('entriesToMap: drops unkeyable elements, keeps duplicates (last wins)', () => {
  const map = entriesToMap([
    null,
    { expectedStart: '10:00' }, // no bookingId -> unusable
    { ...E1, status: 'pending' },
    { ...E1, status: 'accepted' }, // later duplicate wins
  ]);
  assert.deepEqual(Object.keys(map), ['b2']);
  assert.equal(map.b2.status, 'accepted');
});

test('entriesToMap: empty/missing values yield an empty map', () => {
  assert.deepEqual(entriesToMap(null), {});
  assert.deepEqual(entriesToMap(undefined), {});
  assert.deepEqual(entriesToMap([]), {});
});

test('queueEntriesList: both shapes, ordered by expectedStart', () => {
  const asArray = queueEntriesList({ entries: [E1, E3, E2] });
  const asMap = queueEntriesList({
    entries: { b2: E1, b3: E3, b1: E2 },
  });
  const order = (list) => list.map((e) => e.bookingId);
  assert.deepEqual(order(asArray), ['b3', 'b1', 'b2']); // 09:30, 10:00, 11:00
  assert.deepEqual(order(asMap), order(asArray));
});

test('queueEntryOf / queueEntriesMap read both shapes', () => {
  assert.deepEqual(queueEntryOf({ entries: [E1, E2] }, 'b1'), E2);
  assert.deepEqual(queueEntryOf({ entries: { b1: E2 } }, 'b1'), E2);
  assert.equal(queueEntryOf({ entries: [E2] }, 'nope'), null);
  assert.equal(queueEntryOf(null, 'b1'), null);
  assert.deepEqual(queueEntriesMap(null), {});
});

test('queueEntryFromBooking builds the entry that must be stored', () => {
  const entry = queueEntryFromBooking({
    id: 'abc',
    expectedStart: '14:30',
    durationMinutes: 30,
    status: STATUS.PENDING,
  });
  assert.deepEqual(entry, {
    bookingId: 'abc',
    expectedStart: '14:30',
    durationMinutes: 30,
    status: 'pending',
  });
  // falls back to the booked time when expectedStart is missing
  assert.equal(
    queueEntryFromBooking({ id: 'x', scheduledStart: '09:00', status: 'accepted' })
      .expectedStart,
    '09:00'
  );
});

test('queueEntryMatches compares the four stored fields', () => {
  const expected = queueEntryFromBooking({ id: 'b1', ...E2 });
  assert.equal(queueEntryMatches({ ...E2 }, expected), true);
  assert.equal(queueEntryMatches({ ...E2, expectedStart: '10:30' }, expected), false);
  assert.equal(queueEntryMatches(null, expected), false);
  assert.equal(queueEntryMatches({ ...E2, durationMinutes: '45' }, expected), false);
});

test('busyFromQueue: same intervals from both shapes, active statuses only', () => {
  const list = busyFromQueue({ entries: [E3, E2, E1] });
  assert.deepEqual(list, [
    { start: 600, end: 645 }, // 10:00 + 45
    { start: 660, end: 690 }, // 11:00 + 30
  ]);
  const map = busyFromQueue({ entries: { b3: E3, b1: E2, b2: E1 } });
  assert.deepEqual(map, list);
});

test('busyFromQueue: ignoreBookingId skips that booking (proposal re-check)', () => {
  const list = busyFromQueue({ entries: [E1, E2] }, { ignoreBookingId: 'b1' });
  assert.deepEqual(list, [{ start: 660, end: 690 }]);
});

test('queueEntriesAsBookings: both shapes produce the slot-booking objects', () => {
  const fromArray = queueEntriesAsBookings({ entries: [E2] }, '2026-12-01');
  const fromMap = queueEntriesAsBookings({ entries: { b1: E2 } }, '2026-12-01');
  assert.deepEqual(fromArray, fromMap);
  assert.deepEqual(fromArray, [
    {
      id: 'b1',
      date: '2026-12-01',
      status: 'accepted',
      expectedStart: '10:00',
      expectedEnd: '10:45',
      scheduledStart: '10:00',
      scheduledEnd: '10:45',
    },
  ]);
  assert.deepEqual(queueEntriesAsBookings(null, '2026-12-01'), []);
});

test('queueEntriesKey: shape- and order-independent fingerprint', () => {
  const asArray = queueEntriesKey([E1, E2]);
  const asMap = queueEntriesKey({ b2: E1, b1: E2 });
  const reordered = queueEntriesKey([E2, E1]);
  assert.equal(asArray, asMap);
  assert.equal(asArray, reordered);
  assert.notEqual(queueEntriesKey([E1]), queueEntriesKey([E2]));
});
