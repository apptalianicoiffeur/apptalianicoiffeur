/**
 * Queue (smart schedule) helpers.
 *
 * The barber's day is a list of bookings ordered by `expectedStart`.
 * - Ending a session EARLIER than expected opens a "gap" that the barber can
 *   fill by pulling the next client forward or inserting a walk-in.
 * - Ending a session LATER than expected produces a `delay` which cascades to
 *   every following appointment (their `expectedStart` moves later).
 * A client is NEVER moved earlier than their booked time automatically; that
 * only happens through an explicit "pull forward" action by the barber.
 */
import { ACTIVE_STATUSES } from './constants';
import { addMinutes, timeToMin } from './datetime';

/** Today's active queue, ordered by expected time (then by booked time). */
export function todaysQueue(bookings, iso) {
  return (bookings || [])
    .filter((b) => b.date === iso && ACTIVE_STATUSES.includes(b.status))
    .sort((a, b) => {
      const diff = timeToMin(a.expectedStart) - timeToMin(b.expectedStart);
      return diff !== 0 ? diff : timeToMin(a.scheduledStart) - timeToMin(b.scheduledStart);
    });
}

/** Minutes the barber ran OVER the expected end of a booking (0 = on time or early). */
export function delayMinutes(booking, actualEndMin) {
  return Math.max(0, actualEndMin - timeToMin(booking.expectedEnd || booking.scheduledEnd));
}

/** Free minutes left when a session ends before its expected end. */
export function gapMinutes(booking, actualEndMin) {
  return Math.max(0, timeToMin(booking.expectedEnd || booking.scheduledEnd) - actualEndMin);
}

/**
 * Cascade a delay onto every booking AFTER `fromIndex`.
 * Returns [{ booking, newStart, newEnd }] and never moves a booking earlier
 * than its originally booked (scheduled) time.
 *
 * @param {Array} queue        sorted queue of the day
 * @param {number} fromIndex   index of the booking that caused the delay
 * @param {number} delay       minutes to push following appointments
 * @param {(b: object) => number} durationOf  duration of a booking in minutes
 */
export function cascadeShift(queue, fromIndex, delay, durationOf = (b) => b.durationMinutes || 30) {
  if (!delay || delay <= 0) return [];
  const changes = [];
  for (let i = fromIndex + 1; i < queue.length; i++) {
    const b = queue[i];
    const scheduled = timeToMin(b.scheduledStart);
    const current = timeToMin(b.expectedStart);
    // Shift later, but never earlier than the time the client actually booked.
    const newStart = Math.max(scheduled, current + delay);
    const applied = newStart - scheduled; // shift actually applied to this booking
    changes.push({
      booking: b,
      newStart: formatMin(newStart),
      newEnd: formatMin(newStart + durationOf(b)),
      shift: applied,
    });
  }
  return changes;
}

/**
 * How much earlier the next client could be pulled into a gap.
 * Clamped so the client is never called before the previous session really
 * ended (`actualEndMin` = when the ended session actually finished).
 *
 * @returns {number} minutes the next client can move earlier (0 = cannot pull)
 */
export function pullForwardAmount(gap, actualEndMin, nextBooking) {
  if (gap <= 0 || !nextBooking) return 0;
  const nextStart = timeToMin(nextBooking.expectedStart);
  const prevEnd = Number.isFinite(actualEndMin) ? actualEndMin : nextStart;
  return Math.max(0, Math.min(gap, nextStart - prevEnd));
}

/* ------------------------------------------------------------------ */
/* dailyQueue entry shape                                              */
/*                                                                     */
/* `dailyQueue/{date}.entries` is a Map keyed by bookingId:            */
/*   { [bookingId]: { bookingId, expectedStart, durationMinutes,       */
/*                    status } }                                       */
/* The legacy Array shape (one object per element) is still accepted   */
/* on read so nothing breaks before/while the migration runs; every    */
/* write normalizes the document to the Map shape.                     */
/* ------------------------------------------------------------------ */

/**
 * Normalize any stored `entries` value into a plain object Map keyed by
 * `bookingId`.
 *
 * - Array (legacy): each element becomes `{ [e.bookingId]: e }`. Elements
 *   without a usable `bookingId` cannot be keyed and are dropped (they
 *   never carried a usable booking reference); duplicates keep the LAST
 *   occurrence (append order = most recent write).
 * - Map (current): re-keyed by the element's own `bookingId` so the key and
 *   the value can never disagree.
 *
 * @param {Array|object|null|undefined} entries raw `entries` field
 * @returns {object} map keyed by bookingId
 */
export function entriesToMap(entries) {
  const out = {};
  if (!entries) return out;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const key = e && typeof e === 'object' && typeof e.bookingId === 'string' ? e.bookingId : '';
      if (key) out[key] = { ...e, bookingId: key };
    }
    return out;
  }
  if (typeof entries === 'object') {
    for (const [k, v] of Object.entries(entries)) {
      if (!v || typeof v !== 'object') continue;
      const key = typeof v.bookingId === 'string' && v.bookingId ? v.bookingId : k;
      if (!key) continue;
      out[key] = { ...v, bookingId: key };
    }
  }
  return out;
}

/** True when a stored `entries` value still uses the legacy Array shape. */
export function isLegacyEntries(entries) {
  return Array.isArray(entries);
}

/** The entries of a `dailyQueue` document as a Map keyed by bookingId. */
export function queueEntriesMap(daily) {
  return entriesToMap(daily?.entries);
}

/**
 * The entries of a `dailyQueue` document as a list in queue order
 * (by `expectedStart`, then bookingId — the order clients are served in).
 */
export function queueEntriesList(daily) {
  return Object.values(queueEntriesMap(daily)).sort((a, b) => {
    const diff = timeToMin(a.expectedStart) - timeToMin(b.expectedStart);
    return diff !== 0 ? diff : String(a.bookingId).localeCompare(String(b.bookingId));
  });
}

/** The PII-free queue entry of one booking, or null when absent. */
export function queueEntryOf(daily, bookingId) {
  if (!bookingId) return null;
  return queueEntriesMap(daily)[bookingId] || null;
}

/** The queue entry that must be stored for a booking document. */
export function queueEntryFromBooking(booking) {
  return {
    bookingId: booking.id,
    expectedStart: booking.expectedStart || booking.scheduledStart,
    durationMinutes: Number(booking.durationMinutes || 30),
    status: booking.status,
  };
}

/** True when a stored entry already carries exactly the expected values.
 *  Strict (no coercion) so it mirrors the equality used in firestore.rules —
 *  anything looser would make the app skip a rewrite the rules still reject. */
export function queueEntryMatches(entry, expected) {
  return Boolean(
    entry &&
      expected &&
      entry.bookingId === expected.bookingId &&
      entry.expectedStart === expected.expectedStart &&
      entry.durationMinutes === expected.durationMinutes &&
      entry.status === expected.status
  );
}

/**
 * Canonical fingerprint of a queue's `entries` value (shape- and
 * order-independent). Used to decide whether a document must be republished.
 *
 * @param {Array|object|null} entries raw `entries` field (Array or Map)
 */
export function queueEntriesKey(entries) {
  return JSON.stringify(
    Object.values(entriesToMap(entries))
      .map((e) => [e.bookingId, e.expectedStart, Number(e.durationMinutes || 30), e.status])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
}

/**
 * Busy intervals from a PII-free `dailyQueue/{date}` document.
 * Clients read this public document to know which slots are already taken
 * without being able to read other clients' bookings (privacy in rules).
 *
 * Accepts both entry shapes (legacy Array and Map).
 *
 * @param {object} daily the dailyQueue document (or null)
 * @param {object} [options]
 * @param {string} [options.ignoreBookingId] booking whose entry is skipped
 * @returns {Array<{start: number, end: number}>} minutes since midnight
 */
export function busyFromQueue(daily, { ignoreBookingId = null } = {}) {
  return queueEntriesList(daily)
    .filter((e) => ACTIVE_STATUSES.includes(e.status) && e.bookingId !== ignoreBookingId)
    .map((e) => {
      const start = timeToMin(e.expectedStart);
      return { start, end: start + Number(e.durationMinutes || 30) };
    });
}

/**
 * Reshape dailyQueue entries into the booking objects `generateSlots`
 * expects ({ id, date, status, expectedStart/End, scheduledStart/End }).
 * Accepts both entry shapes (legacy Array and Map).
 */
export function queueEntriesAsBookings(daily, iso, { ignoreBookingId = null } = {}) {
  return queueEntriesList(daily)
    .filter((e) => ACTIVE_STATUSES.includes(e.status) && e.bookingId !== ignoreBookingId)
    .map((e) => {
      const end = addMinutes(e.expectedStart, Number(e.durationMinutes || 30));
      return {
        id: e.bookingId,
        date: iso,
        status: e.status,
        expectedStart: e.expectedStart,
        expectedEnd: end,
        scheduledStart: e.expectedStart,
        scheduledEnd: end,
      };
    });
}

/** 1-based position of a booking inside the queue. */
export function queuePosition(queue, bookingId) {
  const idx = queue.findIndex((b) => b.id === bookingId);
  return idx === -1 ? null : idx + 1;
}

/** Minutes -> HH:MM (local helper to avoid an extra import in callers). */
function formatMin(mins) {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
