import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchPrayerBreaks, PrayerTimesError } from '../../src/services/prayerTimes';

test('fetchPrayerBreaks uses local date and the provider country-default method', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({
        code: 200,
        data: {
          timings: {
            Fajr: '05:40',
            Dhuhr: '12:20',
            Asr: '15:30',
            Maghrib: '17:50',
            Isha: '19:10',
          },
        },
      }),
    };
  };

  try {
    const windows = await fetchPrayerBreaks(
      {
        prayerBreakSettings: {
          enabled: true,
          city: 'الجزائر',
          country: 'الجزائر',
          beforeMinutes: 5,
          afterMinutes: 15,
        },
      },
      '2026-11-05'
    );

    assert.equal(requestedUrl.pathname, '/v1/timingsByCity/05-11-2026');
    assert.equal(requestedUrl.searchParams.get('city'), 'الجزائر');
    assert.equal(requestedUrl.searchParams.get('country'), 'الجزائر');
    assert.equal(requestedUrl.searchParams.has('method'), false);
    assert.equal(windows.length, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPrayerBreaks rejects unsuccessful provider responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });

  try {
    await assert.rejects(
      fetchPrayerBreaks(
        {
          prayerBreakSettings: {
            enabled: true,
            city: 'Test city',
            country: 'Test country',
            beforeMinutes: 5,
            afterMinutes: 15,
          },
        },
        '2026-11-06'
      ),
      PrayerTimesError
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
