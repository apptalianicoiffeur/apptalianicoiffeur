const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  if (value >= 1440) return '24:00';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Build the daily prayer break windows from the API's local prayer times. */
export function buildPrayerBreaks(timings, settings) {
  return PRAYER_NAMES.flatMap((prayer) => {
    const prayerMinute = timeToMinutes(timings?.[prayer]);
    if (prayerMinute === null) return [];
    const start = Math.max(0, prayerMinute - settings.beforeMinutes);
    const end = Math.min(1440, prayerMinute + settings.afterMinutes);
    if (start >= end) return [];
    return [{ prayer, start: minutesToTime(start), end: minutesToTime(end) }];
  });
}
