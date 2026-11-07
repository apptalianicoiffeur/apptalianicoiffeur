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
    assert.equal(requestedUrl.searchParams.get('school'), '0');
    assert.equal(windows.length, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPrayerBreaks supports precise coordinates and calculation settings', async () => {
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
    await fetchPrayerBreaks(
      {
        prayerBreakSettings: {
          enabled: true,
          latitude: '36.7538',
          longitude: '3.0588',
          method: 19,
          school: 1,
          beforeMinutes: 5,
          afterMinutes: 15,
          adjustments: { Fajr: 2 },
        },
      },
      '2026-11-05'
    );

    assert.equal(requestedUrl.pathname, '/v1/timings/05-11-2026');
    assert.equal(requestedUrl.searchParams.get('latitude'), '36.7538');
    assert.equal(requestedUrl.searchParams.get('longitude'), '3.0588');
    assert.equal(requestedUrl.searchParams.get('method'), '19');
    assert.equal(requestedUrl.searchParams.get('school'), '1');
    assert.equal(requestedUrl.searchParams.has('city'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPrayerBreaks chooses Algeria calculation when coordinates are used with automatic method', async () => {
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
    await fetchPrayerBreaks(
      {
        prayerBreakSettings: {
          enabled: true,
          country: 'الجزائر',
          latitude: '36.7538',
          longitude: '3.0588',
          method: '',
          beforeMinutes: 5,
          afterMinutes: 15,
        },
      },
      '2026-11-05'
    );

    assert.equal(requestedUrl.searchParams.get('method'), '19');
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
