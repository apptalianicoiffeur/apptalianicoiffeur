import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  getBlocksForDate,
  generateSlots,
  withDefaults,
} from '../../src/utils/slots';
import { addDays, todayISO, weekdayOf } from '../../src/utils/datetime';

/**
 * An open day inside the advance window (`maxAdvanceDays`), on a weekday that
 * is not in `closedWeekdays` (Sunday is closed in the defaults). Computing it
 * keeps the test valid whatever the current date is.
 */
function openDay() {
  for (let i = 2; i <= 12; i++) {
    const iso = addDays(todayISO(), i);
    if (weekdayOf(iso) !== 0) return iso;
  }
  throw new Error('no open day found');
}

const DAY = openDay();

const openSettings = withDefaults({ shopOpen: true, slotInterval: 30 });

test('withDefaults keeps the weekly hours of the defaults', () => {
  assert.equal(openSettings.weeklyHours[3].open, '09:00');
  assert.equal(DEFAULT_SETTINGS.slotInterval, 30);
});

test('withDefaults updates the former default shop name while preserving custom names', () => {
  assert.equal(withDefaults({ shopName: 'تالياني كوفير' }).shopName, 'طالياني كوافير');
  assert.equal(withDefaults({ shopName: 'اسم مخصص' }).shopName, 'اسم مخصص');
});

test('generateSlots walks the whole open window without overlapping', () => {
  const slots = generateSlots({ settings: openSettings, iso: DAY, duration: 30 });

  assert.ok(slots.length > 0, 'a working day must produce slots');
  assert.equal(slots[0].time, '09:00');
  for (let i = 1; i < slots.length; i++) {
    // Slots step by the interval and each ends exactly where the next starts.
    assert.equal(slots[i - 1].end, slots[i].time);
  }
  // Every slot must fit inside the configured closing time of that weekday.
  const close = openSettings.weeklyHours[weekdayOf(DAY)].close;
  const [ch, cm] = close.split(':').map(Number);
  const last = slots[slots.length - 1];
  const [h, m] = last.end.split(':').map(Number);
  assert.ok(h * 60 + m <= ch * 60 + cm, 'no slot may exceed the configured close');
});

test('generateSlots marks taken slots as unavailable', () => {
  const bookings = [
    {
      id: 'b1',
      date: DAY,
      status: 'accepted',
      expectedStart: '10:00',
      expectedEnd: '10:30',
      scheduledStart: '10:00',
      scheduledEnd: '10:30',
    },
  ];

  const slots = generateSlots({ settings: openSettings, iso: DAY, bookings, duration: 30 });
  const taken = slots.find((s) => s.time === '10:00');

  assert.equal(taken.available, false);
  assert.equal(taken.reason, 'taken');
  // A slot right after the booking stays free.
  assert.equal(slots.find((s) => s.time === '10:30').available, true);
});

test('generateSlots returns no slots on a closed day', () => {
  const closed = withDefaults({ shopOpen: true, closedWeekdays: [weekdayOf(DAY)] });
  assert.deepEqual(generateSlots({ settings: closed, iso: DAY, duration: 30 }), []);
});

test('date-range blocks close every included day but leave dates outside the range unchanged', () => {
  const startDate = addDays(DAY, -1);
  const endDate = addDays(DAY, 1);
  const settings = withDefaults({
    shopOpen: true,
    blockedSlots: [{ startDate, endDate, allDay: true, reason: 'إجازة' }],
  });

  assert.equal(getBlocksForDate(settings, DAY)[0].start, '00:00');
  assert.equal(getBlocksForDate(settings, DAY)[0].end, '24:00');
  assert.equal(getBlocksForDate(settings, addDays(startDate, -1)).length, 0);
  assert.equal(generateSlots({ settings, iso: DAY, duration: 30 }).every((slot) => !slot.available), true);
});

test('single-day time blocks keep their existing behavior', () => {
  const settings = withDefaults({
    shopOpen: true,
    blockedSlots: [{ date: DAY, start: '10:00', end: '11:00' }],
  });
  const slots = generateSlots({ settings, iso: DAY, duration: 30 });

  assert.equal(slots.find((slot) => slot.time === '10:00').reason, 'blocked');
  assert.equal(slots.find((slot) => slot.time === '11:00').available, true);
});
