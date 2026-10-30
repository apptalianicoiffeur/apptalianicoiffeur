/**
 * Availability / slot generation.
 *
 * Given the public settings and the bookings of one day, produce the list of
 * bookable time slots, taking into account:
 *  - weekly working hours, weekly days off and specific days off
 *  - breaks and manually blocked slots
 *  - the shop open/closed switch (blocks same-day booking only)
 *  - minimum lead time and maximum advance booking days
 *  - already booked slots (prevents double booking)
 */
import { ACTIVE_STATUSES } from './constants';
import { addDays, addMinutes, nowMinutes, timeToMin, todayISO, weekdayOf } from './datetime';

/** Default settings used until the owner saves real ones. */
export const DEFAULT_SETTINGS = {
  shopOpen: false,
  shopName: 'تالياني كوفير',
  phone: '',
  address: '',
  ownerUid: '',
  slotInterval: 30,
  maxAdvanceDays: 14,
  minLeadMinutes: 30,
  closedWeekdays: [], // weekday indexes (0 = Sunday)
  daysOff: [], // specific ISO dates
  weeklyHours: {
    0: { closed: true, open: '09:00', close: '17:00' },
    1: { closed: false, open: '09:00', close: '19:00' },
    2: { closed: false, open: '09:00', close: '19:00' },
    3: { closed: false, open: '09:00', close: '19:00' },
    4: { closed: false, open: '09:00', close: '19:00' },
    5: { closed: false, open: '09:00', close: '21:00' },
    6: { closed: false, open: '09:00', close: '21:00' },
  },
  breaks: {}, // { weekdayIndex: [{ start, end }] }
  blockedSlots: [], // [{ date, start, end, reason }]
};

/** Merge stored settings over the defaults (missing fields fall back safely). */
export function withDefaults(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  s.weeklyHours = { ...DEFAULT_SETTINGS.weeklyHours, ...(settings?.weeklyHours || {}) };
  return s;
}

/** The working-hours config for one specific date (after days off are applied). */
export function getDayConfig(settings, iso) {
  const dow = weekdayOf(iso);
  const base = settings.weeklyHours?.[dow] || DEFAULT_SETTINGS.weeklyHours[0];
  if ((settings.closedWeekdays || []).includes(dow)) return { ...base, closed: true };
  if ((settings.daysOff || []).includes(iso)) return { ...base, closed: true };
  return base;
}

/** Break windows for a date. */
export function getBreaksForDate(settings, iso) {
  const dow = weekdayOf(iso);
  return settings.breaks?.[dow] || [];
}

/** Blocked slots for a date. */
export function getBlocksForDate(settings, iso) {
  return (settings.blockedSlots || []).filter((b) => b.date === iso);
}

/** True when [startMin, endMin) intersects any of the given windows. */
function overlapsWindows(startMin, endMin, windows) {
  return windows.some((w) => startMin < timeToMin(w.end) && timeToMin(w.start) < endMin);
}

/** All active bookings for a date. */
export function activeBookingsForDay(bookings, iso) {
  return (bookings || []).filter((b) => b.date === iso && ACTIVE_STATUSES.includes(b.status));
}

/**
 * Why a whole day is not bookable (for the UI), or null when it is.
 * Returns an i18n-agnostic reason key: 'off' | 'beyond' | 'past'
 */
export function dayUnbookableReason(settings, iso) {
  const today = todayISO();
  if (iso < today) return 'past';
  if (iso > addDays(today, Number(settings.maxAdvanceDays || 14))) return 'beyond';
  const cfg = getDayConfig(settings, iso);
  if (cfg.closed) return 'off';
  return null;
}

/**
 * Generate the slots of one day.
 *
 * @param {object} options.settings  public settings (with defaults)
 * @param {string} options.iso       date to generate slots for
 * @param {Array}  options.bookings  ALL bookings (will be filtered by date)
 * @param {number} options.duration  service duration in minutes (min 15)
 * @param {object} [options.ignoreBookingId] booking to ignore (owner rescheduling)
 * @returns {Array<{time: string, end: string, available: boolean, reason?: string}>}
 */
export function generateSlots({ settings, iso, bookings = [], duration = 30, ignoreBookingId = null }) {
  const s = withDefaults(settings);
  const interval = Math.max(5, Number(s.slotInterval) || 30);
  const dur = Math.max(15, Number(duration) || interval);

  const today = todayISO();
  const reason = dayUnbookableReason(s, iso);
  if (reason) {
    // Whole day unavailable: still show a placeholder empty list for the UI.
    return [];
  }

  const cfg = getDayConfig(s, iso);
  const breaks = getBreaksForDate(s, iso);
  const blocks = getBlocksForDate(s, iso);
  const dayBookings = activeBookingsForDay(bookings, iso).filter((b) => b.id !== ignoreBookingId);

  const openMin = timeToMin(cfg.open);
  const closeMin = timeToMin(cfg.close);
  const now = nowMinutes();
  const lead = Math.max(0, Number(s.minLeadMinutes) || 0);

  const slots = [];
  for (let start = openMin; start + dur <= closeMin; start += interval) {
    const end = start + dur;
    let available = true;
    let slotReason = null;

    // Shop closed today -> same-day booking disabled entirely.
    if (iso === today && !s.shopOpen) {
      available = false;
      slotReason = 'closed';
    }
    // Too soon (minimum lead time)
    if (iso === today && start < now + lead) {
      available = false;
      slotReason = 'lead';
    }
    // Break window
    if (overlapsWindows(start, end, breaks)) {
      available = false;
      slotReason = 'break';
    }
    // Manually blocked window
    if (overlapsWindows(start, end, blocks)) {
      available = false;
      slotReason = 'blocked';
    }
    // Already booked by another client
    const taken = dayBookings.some(
      (b) => start < timeToMin(b.expectedEnd || b.scheduledEnd) && timeToMin(b.expectedStart || b.scheduledStart) < end
    );
    if (taken) {
      available = false;
      slotReason = 'taken';
    }

    slots.push({
      time: minToTimeLocal(start),
      end: minToTimeLocal(end),
      available,
      reason: slotReason,
    });
  }
  return slots;
}

/** Local min->time helper (kept here to avoid circular imports). */
function minToTimeLocal(mins) {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** True when the shop currently accepts same-day bookings. */
export function canBookToday(settings) {
  return Boolean(withDefaults(settings).shopOpen);
}

/** Next open day (ISO) within the advance window, or null. */
export function nextOpenDay(settings) {
  const s = withDefaults(settings);
  const today = todayISO();
  for (let i = 0; i <= Number(s.maxAdvanceDays || 14); i++) {
    const iso = addDays(today, i);
    const cfg = getDayConfig(s, iso);
    if (cfg.closed) continue;
    if (i === 0 && !s.shopOpen) continue;
    // Has at least one free slot?
    return iso;
  }
  return null;
}

/** Convenience: today's weekday helper used by the hours page. */
export function weekdayNameIndex(index) {
  return index;
}
