import { buildPrayerBreaks } from '../utils/prayerTimes';

const responseCache = new Map();

export class PrayerTimesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrayerTimesError';
  }
}

function apiDate(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

/** Fetch prayer times using the provider's country-default calculation method. */
export async function fetchPrayerBreaks(settings, iso) {
  const config = settings?.prayerBreakSettings;
  if (!config?.enabled) return [];
  if (!config.city?.trim() || !config.country?.trim()) {
    throw new PrayerTimesError('Prayer city and country are required.');
  }

  const key = `${config.city.trim().toLocaleLowerCase()}|${config.country.trim().toLocaleLowerCase()}|${iso}|${config.beforeMinutes}|${config.afterMinutes}`;
  if (responseCache.has(key)) return responseCache.get(key);

  const request = (async () => {
    const params = new URLSearchParams({
      city: config.city.trim(),
      country: config.country.trim(),
    });
    const response = await fetch(
      `https://api.aladhan.com/v1/timingsByCity/${apiDate(iso)}?${params.toString()}`
    );
    if (!response.ok) {
      throw new PrayerTimesError(`Prayer time service returned HTTP ${response.status}.`);
    }

    const result = await response.json();
    if (result?.code !== 200 || !result?.data?.timings) {
      throw new PrayerTimesError('Prayer time service returned invalid data.');
    }

    const windows = buildPrayerBreaks(result.data.timings, config);
    if (windows.length !== 5) {
      throw new PrayerTimesError('Prayer time service did not return all daily prayers.');
    }
    return windows;
  })();

  responseCache.set(key, request);
  try {
    return await request;
  } catch (error) {
    responseCache.delete(key);
    throw error;
  }
}
