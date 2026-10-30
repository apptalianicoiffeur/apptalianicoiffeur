/**
 * Date & time helpers.
 * - Dates are stored as `YYYY-MM-DD` strings (local time, no timezone shifting).
 * - Times are stored as `HH:MM` 24-hour strings.
 * - Arabic formatting uses the Maghreb convention: Western digits (0-9).
 */

const AR_LOCALE = 'ar-DZ-u-nu-latn';

/** Arabic weekday names (index 0 = Sunday, matches JS Date.getDay()). */
export const WEEKDAY_NAMES = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

/** Arabic short weekday names for the date strip. */
export const WEEKDAY_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** Pad a number to 2 digits. */
const pad = (n) => String(n).padStart(2, '0');

/** Today's date in local `YYYY-MM-DD`. */
export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse `YYYY-MM-DD` into a local Date object. */
export function isoToDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Add (or subtract) days to an ISO date string. */
export function addDays(iso, days) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** JS weekday index (0=Sunday) of an ISO date. */
export function weekdayOf(iso) {
  return isoToDate(iso).getDay();
}

/** True when isoA < isoB (string comparison works for YYYY-MM-DD). */
export function isBeforeDay(isoA, isoB) {
  return isoA < isoB;
}

/** 'HH:MM' -> minutes since midnight. */
export function timeToMin(time) {
  if (!time) return 0;
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight -> 'HH:MM'. */
export function minToTime(mins) {
  const m = Math.max(0, Math.round(mins));
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/** Add minutes to an 'HH:MM' time. */
export function addMinutes(time, minutes) {
  return minToTime(timeToMin(time) + minutes);
}

/** Current minutes since midnight (local time). */
export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

/** Format a time for display, e.g. "14:30". */
export function formatTime(time) {
  if (!time) return '—';
  return time;
}

/** Format a full date in Arabic, e.g. "الجمعة 30 أكتوبر 2026". */
export function formatDateLong(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(AR_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(isoToDate(iso));
}

/** Format a date in Arabic short form, e.g. "30 أكتوبر". */
export function formatDateShort(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(AR_LOCALE, { day: 'numeric', month: 'short' }).format(isoToDate(iso));
}

/** "14:30 - 15:15" */
export function formatTimeRange(start, end) {
  if (!start) return '—';
  return end ? `${start} - ${end}` : start;
}

/** Arabic relative time, e.g. "منذ 5 دقائق", "قبل ساعتين". */
export function formatRelative(timestamp) {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(AR_LOCALE, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDateShort(todayISO(date));
}

/** A list of the next `count` days starting today, as ISO strings. */
export function nextDays(count, from = todayISO()) {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

/** Validate a `YYYY-MM-DD` string (real calendar date). */
export function isValidISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const d = isoToDate(iso);
  return todayISO(d) === iso;
}

/** Validate an `HH:MM` string. */
export function isValidTime(time) {
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return false;
  const [h, m] = String(time).split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}
