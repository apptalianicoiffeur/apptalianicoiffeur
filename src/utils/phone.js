/**
 * Phone number helpers.
 * Default country is Algeria (+213). Numbers are validated locally and stored
 * in international E.164 format, e.g. +213550123456.
 */

export const DEFAULT_COUNTRY_CODE = '+213';

const NATIONAL_PREFIXES = ['0', '00213', '+213', '213'];

/**
 * Normalize any user input into E.164 (+213XXXXXXXXX) or null when invalid.
 * Accepts: 0550123456, 550123456, +213550123456, 00213550123456, with spaces/dashes/dots.
 */
export function normalizePhone(input) {
  if (!input) return null;
  let raw = String(input).trim().replace(/[\s\-().]/g, '');
  if (!raw) return null;

  // Strip any national/international prefix variations.
  for (const prefix of NATIONAL_PREFIXES) {
    if (raw.startsWith(prefix)) {
      raw = raw.slice(prefix.length);
      break;
    }
  }
  if (!/^[0-9]+$/.test(raw)) return null;

  // Algerian national numbers: 9 digits (mobile 5/6/7) or 8 digits (landline 2/3/4).
  const valid = /^(5|6|7)[0-9]{8}$/.test(raw) || /^[2-4][0-9]{7}$/.test(raw);
  if (!valid) return null;

  return `${DEFAULT_COUNTRY_CODE}${raw}`;
}

/** True when the input is a valid Algerian number. */
export function isValidPhone(input) {
  return normalizePhone(input) !== null;
}

/** Pretty display format: +213 550 12 34 56 */
export function formatPhone(phone) {
  if (!phone) return '';
  const n = normalizePhone(phone);
  if (!n) return phone;
  const national = n.slice(DEFAULT_COUNTRY_CODE.length);
  if (national.length === 9) {
    return `${DEFAULT_COUNTRY_CODE} ${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(
      5,
      7
    )} ${national.slice(7)}`;
  }
  return `${DEFAULT_COUNTRY_CODE} ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** Digits only (no '+') for building wa.me links. */
export function phoneDigits(phone) {
  const n = normalizePhone(phone);
  if (n) return n.replace('+', '');
  return String(phone || '').replace(/[^\d]/g, '');
}

/** Extract the national part (without leading 0) for pre-filling an input. */
export function nationalPart(phone) {
  const n = normalizePhone(phone);
  return n ? n.slice(DEFAULT_COUNTRY_CODE.length) : '';
}
