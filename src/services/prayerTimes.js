import { buildPrayerBreaks } from '../utils/prayerTimes';

const responseCache = new Map();
const COUNTRY_METHODS = {
  algeria: '19',
  'الجزائر': '19',
  tunisia: '18',
  'تونس': '18',
  morocco: '21',
  'المغرب': '21',
  france: '12',
  'فرنسا': '12',
};

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
  const hasLatitude = String(config.latitude ?? '').trim() !== '';
  const hasLongitude = String(config.longitude ?? '').trim() !== '';
  const hasCoordinates = hasLatitude && hasLongitude;
  if (hasLatitude !== hasLongitude) throw new PrayerTimesError('Both prayer location coordinates are required.');
  if (!hasCoordinates && (!config.city?.trim() || !config.country?.trim())) {
    throw new PrayerTimesError('Prayer city and country or both coordinates are required.');
  }

  const key = JSON.stringify([
    config.city?.trim().toLocaleLowerCase(),
    config.country?.trim().toLocaleLowerCase(),
    hasCoordinates ? Number(config.latitude) : '',
    hasCoordinates ? Number(config.longitude) : '',
    config.method || '',
    config.school ?? 0,
    iso,
    config.beforeMinutes,
    config.afterMinutes,
    config.adjustments || {},
  ]);
  if (responseCache.has(key)) return responseCache.get(key);

  const request = (async () => {
    const params = new URLSearchParams();
    if (hasCoordinates) {
      const latitude = Number(config.latitude);
      const longitude = Number(config.longitude);
      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new PrayerTimesError('Prayer location coordinates are invalid.');
      }
      params.set('latitude', String(latitude));
      params.set('longitude', String(longitude));
    } else {
      params.set('city', config.city.trim());
      params.set('country', config.country.trim());
    }
    const automaticCoordinateMethod = hasCoordinates
      ? COUNTRY_METHODS[config.country?.trim().toLocaleLowerCase()]
      : '';
    const method = config.method === '' || config.method == null ? automaticCoordinateMethod : String(config.method);
    if (method) params.set('method', method);
    params.set('school', String(config.school ?? 0));
    const endpoint = hasCoordinates ? 'timings' : 'timingsByCity';
    const response = await fetch(
      `https://api.aladhan.com/v1/${endpoint}/${apiDate(iso)}?${params.toString()}`
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
