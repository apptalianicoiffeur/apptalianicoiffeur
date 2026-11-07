import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrayerBreaks } from '../../src/utils/prayerTimes';

test('buildPrayerBreaks creates windows around the five daily prayers', () => {
  const windows = buildPrayerBreaks(
    {
      Fajr: '05:41',
      Dhuhr: '12:18',
      Asr: '15:27',
      Maghrib: '17:53',
      Isha: '19:14',
      Sunrise: '07:02',
    },
    { beforeMinutes: 5, afterMinutes: 15 }
  );

  assert.deepEqual(
    windows.map(({ prayer, start, end }) => [prayer, start, end]),
    [
      ['Fajr', '05:36', '05:56'],
      ['Dhuhr', '12:13', '12:33'],
      ['Asr', '15:22', '15:42'],
      ['Maghrib', '17:48', '18:08'],
      ['Isha', '19:09', '19:29'],
    ]
  );
});

test('buildPrayerBreaks clamps windows to the local day and skips invalid timings', () => {
  const windows = buildPrayerBreaks(
    { Fajr: '00:03', Dhuhr: '12:00', Asr: 'bad', Maghrib: '23:55', Isha: '20:00' },
    { beforeMinutes: 10, afterMinutes: 10 }
  );

  assert.equal(windows.find((window) => window.prayer === 'Fajr').start, '00:00');
  assert.equal(windows.find((window) => window.prayer === 'Maghrib').end, '24:00');
  assert.equal(windows.some((window) => window.prayer === 'Asr'), false);
});

test('buildPrayerBreaks applies independent local prayer-time adjustments', () => {
  const windows = buildPrayerBreaks(
    { Fajr: '05:40', Dhuhr: '12:20', Asr: '15:30', Maghrib: '17:50', Isha: '19:10' },
    {
      beforeMinutes: 5,
      afterMinutes: 15,
      adjustments: { Fajr: 3, Dhuhr: -2 },
    }
  );

  assert.deepEqual(
    windows.slice(0, 2).map(({ start, end }) => [start, end]),
    [
      ['05:38', '05:58'],
      ['12:13', '12:33'],
    ]
  );
});
