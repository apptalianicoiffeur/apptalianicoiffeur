import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQueueEntries } from '../../src/hooks/useQueueSync';

const DAY = '2026-03-10';

/**
 * A booking in the real stored shape (see README data model):
 * `todaysQueue` reads date/status/expectedStart/scheduledStart.
 */
const booking = (id, start, status = 'accepted', durationMinutes = 30) => ({
  id,
  date: DAY,
  status,
  durationMinutes,
  scheduledStart: start,
  scheduledEnd: end(start, durationMinutes),
  expectedStart: start,
  expectedEnd: end(start, durationMinutes),
});

function end(start, minutes) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

test('buildQueueEntries keys entries by bookingId', () => {
  const entries = buildQueueEntries(
    [booking('b2', '10:00'), booking('b1', '09:00'), booking('b3', '09:30', 'pending', 60)],
    DAY
  );

  assert.deepEqual(Object.keys(entries).sort(), ['b1', 'b2', 'b3']);
  // The stored entry keeps the "HH:MM" string (the rules validate it as a time).
  assert.equal(entries.b3.expectedStart, '09:30');
  assert.equal(entries.b3.durationMinutes, 60);
  assert.equal(entries.b3.status, 'pending');

  // The Map key and the value's own bookingId can never disagree.
  for (const [key, entry] of Object.entries(entries)) {
    assert.equal(entry.bookingId, key);
  }
});

test('buildQueueEntries ignores other days and terminal statuses', () => {
  const entries = buildQueueEntries(
    [
      booking('ok', '09:00'),
      booking('cancelled', '10:00', 'cancelled'),
      booking('completed', '11:00', 'completed'),
      { ...booking('other-day', '12:00'), date: '2026-03-11' },
    ],
    DAY
  );

  assert.deepEqual(Object.keys(entries), ['ok']);
});

test('buildQueueEntries returns an empty Map for empty input', () => {
  assert.deepEqual(buildQueueEntries([], DAY), {});
  assert.deepEqual(buildQueueEntries(undefined, DAY), {});
});
