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
  entriesToMapReported,
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

/* ------------------------------------------------------------------ */
/* entriesToMapReported: nothing is lost IN SILENCE                    */
/* ------------------------------------------------------------------ */

test('entriesToMapReported: a clean legacy Array produces no problem', () => {
  const { map, problems } = entriesToMapReported([E2, E1]);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(map).sort(), ['b1', 'b2']);
});

test('entriesToMapReported: an element without bookingId is a LOSSY problem', () => {
  const { map, problems } = entriesToMapReported([
    { expectedStart: '10:00', durationMinutes: 30, status: 'pending' },
    E1,
  ]);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].index, 0);
  assert.equal(problems[0].lossy, true);
  assert.match(problems[0].reason, /entries\[0\] has no bookingId/);
  // The usable entry is still carried over.
  assert.deepEqual(Object.keys(map), ['b2']);
});

test('entriesToMapReported: two elements claiming one booking are LOSSY', () => {
  const { map, problems } = entriesToMapReported([
    { ...E1, status: 'pending' },
    { ...E1, status: 'accepted' },
  ]);

  const lossy = problems.filter((p) => p.lossy);
  assert.equal(lossy.length, 1, 'the later duplicate is the reported one');
  assert.equal(lossy[0].index, 1);
  assert.match(lossy[0].reason, /duplicates bookingId "b2"/);
  // Documented behaviour of the read path: last occurrence wins.
  assert.equal(map.b2.status, 'accepted');
});

test('entriesToMapReported: a Map key that disagrees with its value is REPAIRED', () => {
  const { map, problems } = entriesToMapReported({ wrongKey: { ...E1 } });

  assert.equal(problems.length, 1);
  assert.equal(problems[0].lossy, false, 'nothing is lost, so it is not lossy');
  assert.match(problems[0].reason, /carries a different bookingId "b2"/);
  assert.deepEqual(Object.keys(map), ['b2']);
  assert.equal(map.b2.bookingId, 'b2');
});

test('entriesToMapReported: a non-entry Map value is a LOSSY problem', () => {
  const { map, problems } = entriesToMapReported({ b1: E2, broken: 'not-an-entry' });

  assert.equal(problems.length, 1);
  assert.equal(problems[0].index, 'broken');
  assert.equal(problems[0].lossy, true);
  assert.deepEqual(Object.keys(map), ['b1']);
});

test('entriesToMapReported: entries that are neither a list nor a map are reported', () => {
  const { map, problems } = entriesToMapReported('corrupted');
  assert.deepEqual(map, {});
  assert.equal(problems.length, 1);
  assert.equal(problems[0].lossy, true);
  assert.match(problems[0].reason, /neither a list nor a map/);

  // Missing/null values are simply empty (not a problem).
  assert.deepEqual(entriesToMapReported(null), { map: {}, problems: [] });
  assert.deepEqual(entriesToMapReported(undefined), { map: {}, problems: [] });
  assert.deepEqual(entriesToMapReported([]), { map: {}, problems: [] });
});

test('entriesToMap: the optional onProblem callback receives every problem', () => {
  const seen = [];
  const map = entriesToMap([null, { ...E1 }], (p) => seen.push(p.reason));

  assert.deepEqual(Object.keys(map), ['b2']);
  assert.equal(seen.length, 1);
  assert.match(seen[0], /entries\[0\] has no bookingId/);
});
